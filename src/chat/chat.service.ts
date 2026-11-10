import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { MediaService } from '../media/media.service.js';
import {
  MAX_TOOL_CALLS_PER_ROUND,
  parseToolCalls,
  renderToolResults,
  TOOL_CALL_OPEN,
} from '../tools/tool-protocol.js';
import { ToolsService } from '../tools/tools.service.js';
import type { ToolResult } from '../tools/tools.types.js';
import { ChatMessage, ChatRequest, ChatStreamEvent } from './chat.types.js';
import { detectIntent } from './intent.js';
import {
  buildSummarySystemContent,
  clampCovered,
  planSummary,
  sanitizeSummary,
} from './summary.format.js';
import { SummaryService } from './summary.service.js';

const DEFAULT_BASE_URL =
  'https://ws-cu8tv3qiflaw7gap.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3.7-max';
const MAX_TOOL_ROUNDS = 2;
const MAX_TOOL_TEXT_TAIL = TOOL_CALL_OPEN.length - 1;

const SYSTEM_PROMPT =
  '请使用 Markdown 格式回答：代码必须放在带语言标注的 ``` 代码块中，表格使用 Markdown 表格，重点内容用粗体。';

type DashScopeParams = OpenAI.Chat.ChatCompletionCreateParamsStreaming & {
  enable_thinking?: boolean;
};

type DeltaWithReasoning = OpenAI.Chat.ChatCompletionChunk.Choice.Delta & {
  reasoning_content?: string;
};

@Injectable()
export class ChatService {
  private client?: OpenAI;

  constructor(
    private readonly tools: ToolsService,
    private readonly media: MediaService,
    private readonly summarizer: SummaryService,
  ) {}

  normalizeMessages(input: unknown): ChatMessage[] {
    if (!Array.isArray(input)) return [];
    return input
      .filter(
        (item): item is ChatMessage =>
          !!item &&
          typeof item === 'object' &&
          ((item as ChatMessage).role === 'user' || (item as ChatMessage).role === 'assistant') &&
          typeof (item as ChatMessage).content === 'string',
      )
      .map(({ role, content }) => ({ role, content }));
  }

  normalizeRequest(input: unknown): ChatRequest {
    const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const messages = this.normalizeMessages(body.messages);
    const summary = typeof body.summary === 'string' ? sanitizeSummary(body.summary) : '';
    const upTo =
      typeof body.summaryUpTo === 'number' &&
      Number.isInteger(body.summaryUpTo) &&
      body.summaryUpTo >= 0
        ? body.summaryUpTo
        : null;
    if (!summary || upTo === null) return { messages };

    // 摘要至少要留下最后一条消息，避免客户端传入越界的 summaryUpTo 后丢失本轮提问
    const limit = Math.max(0, messages.length - 1);

    return { messages, summary, summaryUpTo: clampCovered(upTo, limit) };
  }

  async *stream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    const messages = request.messages;
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    if (lastUser) {
      const intent = detectIntent(lastUser.content);
      if (intent !== 'text') {
        yield* this.media.stream(intent, lastUser.content, signal);
        return;
      }
    }

    let summary = request.summary?.trim() ?? '';
    const covered = clampCovered(request.summaryUpTo ?? 0, Math.max(0, messages.length - 1));
    let conversation: ChatMessage[] = messages.slice(covered);

    const plan = planSummary(messages, covered);
    if (plan) {
      yield { event: 'status', data: '正在整理更早的对话…' };
      let nextSummary = '';
      try {
        nextSummary = await this.summarizer.summarize(summary, plan.overflow, signal);
      } catch {
        // 摘要失败不阻塞本轮回答，保留旧摘要并在下一轮重试
      }
      if (signal?.aborted) return;

      conversation = plan.recent;
      if (nextSummary) {
        summary = nextSummary;
        yield {
          event: 'summary',
          data: { text: summary, upTo: plan.nextSummaryUpTo },
        };
      }
      yield { event: 'status', data: '' };
    }

    const summarySystem = summary ? buildSummarySystemContent(summary) : null;

    for (let round = 0; ; round++) {
      const allowTools = round < MAX_TOOL_ROUNDS;
      const system = allowTools
        ? this.tools.buildSystemPrompt(SYSTEM_PROMPT)
        : `${SYSTEM_PROMPT}\n\n本轮禁止调用任何工具，请直接基于已有的工具结果和上下文回答用户。`;
      const systemMessages: OpenAI.Chat.ChatCompletionMessageParam[] = summarySystem
        ? [
            { role: 'system', content: summarySystem },
            { role: 'system', content: system },
          ]
        : [{ role: 'system', content: system }];

      let completion: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
      try {
        const params: DashScopeParams = {
          model: process.env.DASHSCOPE_MODEL ?? DEFAULT_MODEL,
          messages: [...systemMessages, ...conversation],
          stream: true,
          enable_thinking: true,
        };
        completion = await this.getClient().chat.completions.create(params, { signal });
      } catch (error) {
        if (!signal?.aborted) {
          yield { event: 'error', data: toMessage(error) };
        }
        return;
      }

      let full = '';
      let emitted = 0;
      let toolMode = false;
      let streamError: unknown;

      try {
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta as DeltaWithReasoning | undefined;
          if (!delta) continue;
          if (delta.reasoning_content) {
            yield { event: 'reasoning', data: delta.reasoning_content };
          }
          if (!delta.content) continue;

          full += delta.content;
          if (!allowTools) {
            yield { event: 'message', data: delta.content };
            continue;
          }
          if (toolMode) continue;

          if (full.includes(TOOL_CALL_OPEN)) {
            toolMode = true;
            continue;
          }

          // 末尾可能是被拆到多个 chunk 的 <tool_call>，先保留不发送
          const safeEnd = Math.max(emitted, full.length - MAX_TOOL_TEXT_TAIL);
          if (safeEnd > emitted) {
            yield { event: 'message', data: full.slice(emitted, safeEnd) };
            emitted = safeEnd;
          }
        }
      } catch (error) {
        streamError = error;
      }

      if (signal?.aborted) return;
      if (streamError) {
        yield { event: 'error', data: toMessage(streamError) };
        return;
      }

      if (!allowTools) {
        yield { event: 'complete', data: true };
        return;
      }

      const parsed = parseToolCalls(full);
      if (!parsed.calls.length) {
        if (emitted < full.length) {
          yield { event: 'message', data: full.slice(emitted) };
        }
        yield { event: 'complete', data: true };
        return;
      }

      const calls = parsed.calls.slice(0, MAX_TOOL_CALLS_PER_ROUND);
      const results: ToolResult[] = [];

      for (const call of calls) {
        if (signal?.aborted) return;
        yield { event: 'tool_call', data: { name: call.name, arguments: call.arguments } };

        const result = await this.tools.execute(call, signal);
        if (signal?.aborted) return;

        results.push(result);
        yield {
          event: 'tool_result',
          data: {
            name: result.name,
            ok: result.ok,
            content: result.content,
            durationMs: result.durationMs,
          },
        };
      }

      const errors = [...parsed.errors];
      if (parsed.calls.length > calls.length) {
        errors.push(
          `本轮工具调用数量超过上限（${MAX_TOOL_CALLS_PER_ROUND}），已忽略 ${parsed.calls.length - calls.length} 个。`,
        );
      }

      conversation.push({ role: 'assistant', content: full.trim() });
      conversation.push({ role: 'user', content: renderToolResults(results, errors) });
    }
  }

  private getClient(): OpenAI {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error('请设置环境变量 DASHSCOPE_API_KEY');
    }
    this.client ??= new OpenAI({
      apiKey,
      baseURL: process.env.DASHSCOPE_BASE_URL ?? DEFAULT_BASE_URL,
    });
    return this.client;
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

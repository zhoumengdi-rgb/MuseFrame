import { describe, expect, it } from 'vitest';
import type { MediaService } from '../media/media.service.js';
import type { ToolsService } from '../tools/tools.service.js';
import { ChatService } from './chat.service.js';
import type { ChatMessage, ChatStreamEvent } from './chat.types.js';
import type { SummaryService } from './summary.service.js';

interface FakeParams {
  messages: { role: string; content: string }[];
}

function history(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `第${index}条消息`,
  }));
}

function createService(summarize: () => Promise<string> = async () => '') {
  const summarizeCalls: { previous: string; messages: ChatMessage[] }[] = [];
  const summarizer = {
    summarize: async (previous: string, messages: ChatMessage[]) => {
      summarizeCalls.push({ previous, messages });
      return summarize();
    },
  } as unknown as SummaryService;
  const tools = { buildSystemPrompt: (base: string) => base } as unknown as ToolsService;
  const media = {} as unknown as MediaService;
  const service = new ChatService(tools, media, summarizer);

  const requests: FakeParams[] = [];
  (service as unknown as { client: unknown }).client = {
    chat: {
      completions: {
        create: async (params: FakeParams) => {
          requests.push(params);
          return (async function* () {
            yield { choices: [{ delta: { content: '好的' } }] };
          })();
        },
      },
    },
  };

  return { service, requests, summarizeCalls };
}

async function collect(stream: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('ChatService.normalizeRequest', () => {
  it('保留完整历史，不再按 20 条截断', () => {
    const { service } = createService();

    expect(service.normalizeRequest({ messages: history(25) }).messages).toHaveLength(25);
  });

  it('清理摘要并收敛越界的 summaryUpTo', () => {
    const { service } = createService();
    const request = service.normalizeRequest({
      messages: history(10),
      summary: '<b>旧摘要</b>',
      summaryUpTo: 99,
    });

    expect(request.summary).toBe('旧摘要');
    // 至少保留最后一条消息，避免丢掉本轮提问
    expect(request.summaryUpTo).toBe(9);
  });

  it('summaryUpTo 无效时忽略摘要，改用完整历史', () => {
    const { service } = createService();
    const request = service.normalizeRequest({
      messages: history(10),
      summary: '旧摘要',
      summaryUpTo: 2.5,
    });

    expect(request.summary).toBeUndefined();
    expect(request.summaryUpTo).toBeUndefined();
  });

  it('没有有效摘要时忽略 summaryUpTo', () => {
    const { service } = createService();
    const request = service.normalizeRequest({
      messages: history(10),
      summary: '   ',
      summaryUpTo: 4,
    });

    expect(request.summary).toBeUndefined();
    expect(request.summaryUpTo).toBeUndefined();
  });
});

describe('ChatService 滚动摘要', () => {
  it('达到阈值时压缩早期对话，并把摘要放在 system 消息最前面', async () => {
    const { service, requests, summarizeCalls } = createService(async () => '压缩后的摘要');

    const events = await collect(service.stream({ messages: history(30) }));

    expect(events.map((event) => event.event)).toEqual([
      'status',
      'summary',
      'status',
      'message',
      'complete',
    ]);
    expect(summarizeCalls[0]?.messages).toHaveLength(10);
    expect(events[1]).toEqual({
      event: 'summary',
      data: { text: '压缩后的摘要', upTo: 10 },
    });

    const sent = requests[0]?.messages ?? [];
    expect(sent).toHaveLength(22);
    expect(sent[0]?.content).toContain('## 更早对话摘要');
    expect(sent[1]?.content).toContain('Markdown');
    expect(sent[2]?.content).toBe('第10条消息');
  });

  it('把已有摘要交给摘要服务继续合并', async () => {
    const { service, summarizeCalls } = createService(async () => '新摘要');

    await collect(
      service.stream({ messages: history(40), summary: '旧摘要', summaryUpTo: 10 }),
    );

    expect(summarizeCalls[0]?.previous).toBe('旧摘要');
    expect(summarizeCalls[0]?.messages).toHaveLength(10);
  });

  it('摘要失败时继续回答，不报错也不推进进度', async () => {
    const { service, requests } = createService(async () => {
      throw new Error('摘要服务不可用');
    });

    const events = await collect(service.stream({ messages: history(30) }));

    expect(events.map((event) => event.event)).toEqual([
      'status',
      'status',
      'message',
      'complete',
    ]);
    expect(events.find((event) => event.event === 'error')).toBeUndefined();
    // 回退到最近 20 条消息，不再带摘要 system 消息
    expect(requests[0]?.messages).toHaveLength(21);
  });
});

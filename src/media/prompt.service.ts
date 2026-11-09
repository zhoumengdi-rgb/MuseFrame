import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { withTimeout } from './media.http.js';
import type { ImagePrompt } from './media.types.js';
import { parseImagePrompt } from './prompt.format.js';

const DEFAULT_BASE_URL =
  'https://ws-cu8tv3qiflaw7gap.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3.7-max';
const REQUEST_TIMEOUT_MS = 15_000;

const IMAGE_PROMPT_SYSTEM = [
  '你是文生图提示词工程师。把用户的自然语言需求改写成可直接交给文生图模型的中文提示词。',
  '正向提示词：忠于原意，不添加无关主体；补全主体与动作、环境与背景、构图与视角、光线与色彩、艺术风格、画质细节；写成一段连贯描述，不要编号、Markdown 或解释。',
  '反向提示词：列出画面中应避免的问题，如低清晰度、模糊、噪点、过曝、畸形、多余手指、多手多脚、错位肢体、文字水印、签名，用中文逗号分隔。',
  '只输出严格 JSON：{"positive":"...","negative":"..."}，不要代码块或其他文字。',
].join('\n');

type ChatParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
  enable_thinking?: boolean;
};

@Injectable()
export class PromptEnhancerService {
  private client?: OpenAI;

  async enhance(prompt: string, signal?: AbortSignal): Promise<ImagePrompt> {
    const params: ChatParams = {
      model: process.env.DASHSCOPE_MODEL ?? DEFAULT_MODEL,
      messages: [
        { role: 'system', content: IMAGE_PROMPT_SYSTEM },
        { role: 'user', content: prompt },
      ],
      max_tokens: 700,
      enable_thinking: false,
    };
    const completion = await this.getClient().chat.completions.create(params, {
      signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
    });
    return parseImagePrompt(completion.choices[0]?.message?.content ?? '', prompt);
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

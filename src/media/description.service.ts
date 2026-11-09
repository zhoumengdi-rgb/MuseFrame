import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { parseVideoNarration, type VideoNarration } from './description.format.js';
import { withTimeout } from './media.http.js';

const DEFAULT_BASE_URL =
  'https://ws-cu8tv3qiflaw7gap.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3.7-max';
const REQUEST_TIMEOUT_MS = 20_000;

const IMAGE_SYSTEM_PROMPT =
  '你是图片描述助手。根据用户的图片需求，用 1-2 句中文描述最终画面（主体、环境、光线、风格），只输出描述本身，不要标题、列表或解释。';

const VIDEO_SYSTEM_PROMPT = [
  '你是 AI 视频分镜助手。根据用户的视频需求补全镜头语言，只输出 5 行，每行格式为“字段：内容”，字段依次为主体、画面推进、镜头风格、声音、画面文字描述。',
  '每行一句中文，不要编号、不要 Markdown、不要解释；画面文字描述没有就写“无”。',
].join('\n');

type DescriptionParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
  enable_thinking?: boolean;
};

@Injectable()
export class DescriptionService {
  private client?: OpenAI;

  async describeImage(prompt: string, signal?: AbortSignal): Promise<string> {
    return this.complete(IMAGE_SYSTEM_PROMPT, prompt, signal);
  }

  async describeVideo(prompt: string, signal?: AbortSignal): Promise<Partial<VideoNarration>> {
    const raw = await this.complete(VIDEO_SYSTEM_PROMPT, prompt, signal);
    return parseVideoNarration(raw);
  }

  private async complete(system: string, prompt: string, signal?: AbortSignal): Promise<string> {
    const params: DescriptionParams = {
      model: process.env.DASHSCOPE_MODEL ?? DEFAULT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: 400,
      enable_thinking: false,
    };
    const completion = await this.getClient().chat.completions.create(params, {
      signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
    });
    return completion.choices[0]?.message?.content?.trim() ?? '';
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

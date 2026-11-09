import { Injectable } from '@nestjs/common';
import {
  dashscopeHeaders,
  describeApiError,
  ensureHttpUrl,
  extractImageUrl,
  getMediaBaseUrl,
  readPayload,
  withTimeout,
} from './media.http.js';
import type { ImagePrompt } from './media.types.js';

const DEFAULT_IMAGE_MODEL = 'qwen-image-3.0';
const REQUEST_TIMEOUT_MS = 180_000;

@Injectable()
export class ImageService {
  async generate(prompt: ImagePrompt, signal?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await fetch(
        `${getMediaBaseUrl()}/api/v1/services/aigc/multimodal-generation/generation`,
        {
          method: 'POST',
          headers: dashscopeHeaders(),
          body: JSON.stringify({
            model: process.env.DASHSCOPE_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL,
            input: {
              messages: [{ role: 'user', content: [{ text: prompt.positive }] }],
            },
            // 提示词已由内部模型扩写，关闭平台侧的二次改写，避免覆盖正/反向约束
            parameters: {
              prompt_extend: false,
              ...(prompt.negative ? { negative_prompt: prompt.negative } : {}),
            },
          }),
          signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw translateError(error, '图片生成');
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(describeApiError('图片生成', response, payload));
    }

    const url = extractImageUrl(payload);
    if (!url) {
      throw new Error('图片生成失败：接口未返回图片地址');
    }
    return ensureHttpUrl(url);
  }
}

function translateError(error: unknown, label: string): unknown {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new Error(`${label}超时，请稍后重试`);
  }
  return error;
}

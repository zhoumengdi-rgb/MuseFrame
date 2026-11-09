import { Injectable } from '@nestjs/common';
import type { ChatStreamEvent } from '../chat/chat.types.js';
import { composeImageAnswer, composeVideoAnswer } from './description.format.js';
import { DescriptionService } from './description.service.js';
import { ImageService } from './image.service.js';
import { toErrorMessage } from './media.http.js';
import type { MediaKind } from './media.types.js';
import { fallbackImagePrompt } from './prompt.format.js';
import { PromptEnhancerService } from './prompt.service.js';
import { getVideoDuration, getVideoModel, VideoService } from './video.service.js';

@Injectable()
export class MediaService {
  constructor(
    private readonly images: ImageService,
    private readonly videos: VideoService,
    private readonly descriptions: DescriptionService,
    private readonly prompts: PromptEnhancerService,
  ) {}

  async *stream(
    kind: MediaKind,
    prompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    try {
      let url: string | undefined;

      if (kind === 'image') {
        // 先用文本模型把自然语言扩写成正向/反向提示词，失败时回退到原始输入
        yield { event: 'status', data: '正在优化绘图提示词…' };
        const imagePrompt = await this.prompts
          .enhance(prompt, signal)
          .catch(() => fallbackImagePrompt(prompt));
        if (signal?.aborted) return;

        // 描述与生成并行，描述失败不阻塞出图
        const narration = this.descriptions
          .describeImage(imagePrompt.positive, signal)
          .catch(() => undefined);

        yield { event: 'status', data: '正在生成图片…' };
        url = await this.images.generate(imagePrompt, signal);

        if (signal?.aborted) return;
        if (!url) {
          throw new Error('生成失败：接口未返回媒体地址');
        }

        const answer = composeImageAnswer(await narration, prompt);
        if (signal?.aborted) return;
        yield { event: 'message', data: answer };
      } else {
        const narration = this.descriptions.describeVideo(prompt, signal).catch(() => undefined);

        yield { event: 'status', data: '正在提交视频生成任务…' };
        for await (const step of this.videos.generate(prompt, signal)) {
          if (step.type === 'status') {
            yield { event: 'status', data: step.data };
          } else {
            url = step.url;
          }
        }

        if (signal?.aborted) return;
        if (!url) {
          throw new Error('生成失败：接口未返回媒体地址');
        }

        const answer = composeVideoAnswer(
          await narration,
          prompt,
          getVideoModel(),
          getVideoDuration(),
        );
        if (signal?.aborted) return;
        yield { event: 'message', data: answer };
      }

      yield { event: 'media', data: { kind, url, prompt } };
      yield { event: 'complete', data: true };
    } catch (error) {
      if (!signal?.aborted) {
        yield { event: 'error', data: toErrorMessage(error) };
      }
    }
  }
}

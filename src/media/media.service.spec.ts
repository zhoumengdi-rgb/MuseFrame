import { describe, expect, it } from 'vitest';
import type { ChatStreamEvent } from '../chat/chat.types.js';
import { DescriptionService } from './description.service.js';
import { ImageService } from './image.service.js';
import { MediaService } from './media.service.js';
import type { ImagePrompt } from './media.types.js';
import { DEFAULT_NEGATIVE_PROMPT } from './prompt.format.js';
import { PromptEnhancerService } from './prompt.service.js';
import { VideoService } from './video.service.js';

function createMediaService(overrides: {
  imageUrl?: string;
  imageNarration?: () => Promise<string>;
  videoNarration?: () => Promise<Record<string, string>>;
  enhance?: () => Promise<ImagePrompt>;
}) {
  const calls = {
    generated: [] as ImagePrompt[],
    described: [] as string[],
  };

  const images = {
    generate: async (prompt: ImagePrompt) => {
      calls.generated.push(prompt);
      return overrides.imageUrl ?? 'https://example.com/image.png';
    },
  } as unknown as ImageService;

  const videos = {
    async *generate() {
      yield { type: 'status', data: '视频生成中…' };
      yield { type: 'url', url: 'https://example.com/video.mp4' };
    },
  } as unknown as VideoService;

  const descriptions = {
    describeImage: async (prompt: string) => {
      calls.described.push(prompt);
      return overrides.imageNarration
        ? overrides.imageNarration()
        : '一只橘猫坐在窗台上，水彩插画风格。';
    },
    describeVideo:
      overrides.videoNarration ??
      (async () => ({
        subject: '屋顶上的小猫',
        motion: '镜头跟随推进',
        style: '电影感',
        sound: '夜晚环境音',
        onScreenText: '无',
      })),
  } as unknown as DescriptionService;

  const prompts = {
    enhance:
      overrides.enhance ??
      (async (input: string) => ({
        positive: `${input}，主体清晰，光线柔和，细节丰富`,
        negative: '低清晰度，模糊',
      })),
  } as PromptEnhancerService;

  return { media: new MediaService(images, videos, descriptions, prompts), calls };
}

async function collect(stream: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function messageText(events: ChatStreamEvent[]): string {
  const event = events.find(
    (item): item is Extract<ChatStreamEvent, { event: 'message' }> => item.event === 'message',
  );
  return event?.data ?? '';
}

describe('MediaService', () => {
  it('图片先增强提示词，再下发描述与媒体地址', async () => {
    const { media, calls } = createMediaService({});
    const events = await collect(media.stream('image', '画一只橘猫'));

    expect(events.map((event) => event.event)).toEqual([
      'status',
      'status',
      'message',
      'media',
      'complete',
    ]);
    expect(events[0]).toEqual({ event: 'status', data: '正在优化绘图提示词…' });
    expect(events[1]).toEqual({ event: 'status', data: '正在生成图片…' });
    expect(calls.generated).toEqual([
      { positive: '画一只橘猫，主体清晰，光线柔和，细节丰富', negative: '低清晰度，模糊' },
    ]);
    expect(calls.described).toEqual(['画一只橘猫，主体清晰，光线柔和，细节丰富']);
    expect(events[2]).toEqual({
      event: 'message',
      data: '已为你生成图片。\n\n**画面描述**：一只橘猫坐在窗台上，水彩插画风格。',
    });
  });

  it('提示词增强失败时回退到原始输入和默认反向提示词', async () => {
    const { media, calls } = createMediaService({
      enhance: async () => {
        throw new Error('增强服务不可用');
      },
    });
    const events = await collect(media.stream('image', '生成一张武松打虎的图片'));

    expect(events.find((event) => event.event === 'error')).toBeUndefined();
    expect(calls.generated).toEqual([
      { positive: '生成一张武松打虎的图片', negative: DEFAULT_NEGATIVE_PROMPT },
    ]);
    expect(events.at(-1)).toEqual({ event: 'complete', data: true });
  });

  it('视频回答包含模型、时长和分镜字段', async () => {
    const { media } = createMediaService({});
    const events = await collect(media.stream('video', '一只小猫在屋顶上奔跑，流畅运镜'));

    expect(events.map((event) => event.event)).toEqual([
      'status',
      'status',
      'message',
      'media',
      'complete',
    ]);
    const answer = messageText(events);
    expect(answer).toContain('| 使用模型 | happyhorse-1.1-t2v |');
    expect(answer).toContain('| 时长 | 5 秒 |');
    expect(answer).toContain('| 主体 | 屋顶上的小猫 |');
    expect(answer).toContain('| 画面文字描述 | 无 |');
  });

  it('描述生成失败时仍返回媒体和保底描述', async () => {
    const { media } = createMediaService({
      imageNarration: async () => {
        throw new Error('描述服务不可用');
      },
    });
    const events = await collect(media.stream('image', '画一只橘猫'));

    expect(events.find((event) => event.event === 'error')).toBeUndefined();
    expect(messageText(events)).toContain('**画面描述**：画一只橘猫');
    expect(events[3]).toEqual({
      event: 'media',
      data: {
        kind: 'image',
        url: 'https://example.com/image.png',
        prompt: '画一只橘猫',
      },
    });
    expect(events[4]).toEqual({ event: 'complete', data: true });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageService } from './image.service.js';

const ORIGINAL_KEY = process.env.DASHSCOPE_API_KEY;

describe('ImageService', () => {
  beforeEach(() => {
    process.env.DASHSCOPE_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it('把正向与反向提示词转发生图接口', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(
        JSON.stringify({
          output: {
            choices: [
              { message: { role: 'assistant', content: [{ type: 'image', image: 'https://x.test/a.png' }] } },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new ImageService();
    const url = await service.generate({ positive: '武松打虎，景阳冈松林', negative: '低清晰度，水印' });

    expect(url).toBe('https://x.test/a.png');
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string) as {
      input: { messages: Array<{ content: Array<{ text: string }> }> };
      parameters: Record<string, unknown>;
    };
    expect(body.input.messages[0].content[0].text).toBe('武松打虎，景阳冈松林');
    expect(body.parameters).toEqual({ prompt_extend: false, negative_prompt: '低清晰度，水印' });
  });

  it('反向提示词为空时不发送 negative_prompt', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ output: { urls: ['https://x.test/b.png'] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new ImageService().generate({ positive: '极简线条画', negative: '' });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string) as { parameters: Record<string, unknown> };
    expect(body.parameters).toEqual({ prompt_extend: false });
  });
});

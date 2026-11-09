import { describe, expect, it } from 'vitest';
import {
  ensureHttpUrl,
  extractImageUrl,
  extractTaskId,
  extractVideoTask,
} from './media.http.js';

describe('extractImageUrl', () => {
  it('读取 multimodal-generation 的 content 图片地址', () => {
    const payload = {
      output: {
        choices: [
          { message: { role: 'assistant', content: [{ type: 'image', image: 'https://x.test/a.png' }] } },
        ],
      },
    };
    expect(extractImageUrl(payload)).toBe('https://x.test/a.png');
  });

  it('兼容 results / urls 形式', () => {
    expect(extractImageUrl({ output: { results: [{ url: 'https://x.test/b.png' }] } })).toBe(
      'https://x.test/b.png',
    );
    expect(extractImageUrl({ output: { urls: ['https://x.test/c.png'] } })).toBe(
      'https://x.test/c.png',
    );
    expect(extractImageUrl({ output: {} })).toBeUndefined();
  });
});

describe('视频任务响应', () => {
  it('读取 task_id', () => {
    expect(extractTaskId({ output: { task_id: 'abc', task_status: 'PENDING' } })).toBe('abc');
    expect(extractTaskId({ output: {} })).toBeUndefined();
  });

  it('读取任务状态与视频地址', () => {
    const task = extractVideoTask({
      output: {
        task_id: 'abc',
        task_status: 'SUCCEEDED',
        video_url: 'https://x.test/v.mp4',
      },
    });
    expect(task).toEqual({
      status: 'SUCCEEDED',
      message: undefined,
      url: 'https://x.test/v.mp4',
    });
  });

  it('读取失败原因，未知状态归为 UNKNOWN', () => {
    expect(extractVideoTask({ output: { task_status: 'FAILED', message: '内容不合规' } })).toMatchObject(
      { status: 'FAILED', message: '内容不合规' },
    );
    expect(extractVideoTask({ output: { task_status: 'PAUSED' } }).status).toBe('UNKNOWN');
  });
});

describe('ensureHttpUrl', () => {
  it('只接受 http(s) 地址', () => {
    expect(ensureHttpUrl('https://x.test/a.png')).toBe('https://x.test/a.png');
    expect(() => ensureHttpUrl('javascript:alert(1)')).toThrow('接口返回的媒体地址无效');
  });
});

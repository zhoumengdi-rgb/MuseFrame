import { Injectable } from '@nestjs/common';
import {
  dashscopeHeaders,
  describeApiError,
  ensureHttpUrl,
  extractTaskId,
  extractVideoTask,
  getMediaBaseUrl,
  readPayload,
  withTimeout,
} from './media.http.js';
import type { VideoTask } from './media.types.js';

const DEFAULT_VIDEO_MODEL = 'happyhorse-1.1-t2v';
const SUBMIT_TIMEOUT_MS = 30_000;
const QUERY_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 3_000;
const MAX_WAIT_MS = 300_000;
const MAX_QUERY_FAILURES = 3;

export type VideoStep = { type: 'status'; data: string } | { type: 'url'; url: string };

@Injectable()
export class VideoService {
  async *generate(prompt: string, signal?: AbortSignal): AsyncGenerator<VideoStep> {
    const taskId = await this.submit(prompt, signal);
    yield { type: 'status', data: '视频任务已提交，正在生成…' };

    const startedAt = Date.now();
    let lastStatus = 'PENDING';
    let failures = 0;

    while (true) {
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        throw new Error('视频生成超时（超过 5 分钟），请稍后重试');
      }

      await delay(POLL_INTERVAL_MS, signal);

      let task: VideoTask;
      try {
        task = await this.query(taskId, signal);
        failures = 0;
      } catch (error) {
        if (signal?.aborted) throw error;
        if (++failures >= MAX_QUERY_FAILURES) throw error;
        continue;
      }

      if (task.status !== lastStatus) {
        lastStatus = task.status;
        if (task.status === 'RUNNING') {
          yield { type: 'status', data: '视频生成中…' };
        }
      }

      if (task.status === 'SUCCEEDED') {
        if (!task.url) {
          throw new Error('视频生成成功，但接口未返回视频地址');
        }
        yield { type: 'url', url: ensureHttpUrl(task.url) };
        return;
      }

      if (task.status === 'FAILED' || task.status === 'CANCELED' || task.status === 'UNKNOWN') {
        throw new Error(`视频生成失败${task.message ? `：${task.message}` : `（${task.status}）`}`);
      }
    }
  }

  private async submit(prompt: string, signal?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await fetch(
        `${getMediaBaseUrl()}/api/v1/services/aigc/video-generation/video-synthesis`,
        {
          method: 'POST',
          headers: dashscopeHeaders({ 'X-DashScope-Async': 'enable' }),
          body: JSON.stringify({
            model: getVideoModel(),
            input: { prompt },
            parameters: {
              resolution: process.env.DASHSCOPE_VIDEO_RESOLUTION ?? '720P',
              ratio: process.env.DASHSCOPE_VIDEO_RATIO ?? '16:9',
              duration: getVideoDuration(),
            },
          }),
          signal: withTimeout(signal, SUBMIT_TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw translateError(error, '视频任务提交');
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(describeApiError('视频任务提交', response, payload));
    }

    const taskId = extractTaskId(payload);
    if (!taskId) {
      throw new Error('视频任务提交失败：接口未返回 task_id');
    }
    return taskId;
  }

  private async query(taskId: string, signal?: AbortSignal) {
    let response: Response;
    try {
      response = await fetch(`${getMediaBaseUrl()}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: dashscopeHeaders(),
        signal: withTimeout(signal, QUERY_TIMEOUT_MS),
      });
    } catch (error) {
      throw translateError(error, '视频任务查询');
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(describeApiError('视频任务查询', response, payload));
    }
    return extractVideoTask(payload);
  }
}

export function getVideoModel(): string {
  return process.env.DASHSCOPE_VIDEO_MODEL ?? DEFAULT_VIDEO_MODEL;
}

export function getVideoDuration(): number {
  const duration = Number(process.env.DASHSCOPE_VIDEO_DURATION);
  return Number.isInteger(duration) && duration >= 2 && duration <= 30 ? duration : 5;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error('已停止生成');
  error.name = 'AbortError';
  return error;
}

function translateError(error: unknown, label: string): unknown {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new Error(`${label}超时，请稍后重试`);
  }
  return error;
}

import type { VideoTask, VideoTaskStatus } from './media.types.js';

export const DEFAULT_MEDIA_BASE_URL = 'https://cn-beijing.maas.qianwenaiapi.com';

export function getMediaBaseUrl(): string {
  return (process.env.DASHSCOPE_MEDIA_BASE_URL ?? DEFAULT_MEDIA_BASE_URL).replace(/\/+$/, '');
}

export function dashscopeHeaders(extra?: Record<string, string>): Record<string, string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('请设置环境变量 DASHSCOPE_API_KEY');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  };
}

export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function describeApiError(label: string, response: Response, payload: unknown): string {
  const data = asRecord(payload);
  const detail =
    asString(data?.message) ??
    asString(data?.code) ??
    (typeof payload === 'string' ? payload.slice(0, 300) : undefined);
  return `${label}失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`;
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ensureHttpUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('接口返回的媒体地址无效');
  }
  return url;
}

export function extractImageUrl(payload: unknown): string | undefined {
  const output = asRecord(asRecord(payload)?.output);
  const direct = asString(output?.image) ?? asString(output?.url);
  if (direct) return direct;

  const choices = Array.isArray(output?.choices) ? output.choices : [];
  for (const choice of choices) {
    const content = asRecord(asRecord(choice)?.message)?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const image = asString(asRecord(part)?.image);
      if (image) return image;
    }
  }

  return firstResultUrl(output);
}

export function extractTaskId(payload: unknown): string | undefined {
  const output = asRecord(asRecord(payload)?.output);
  return asString(output?.task_id) ?? asString(output?.taskId);
}

export function extractVideoTask(payload: unknown): VideoTask {
  const output = asRecord(asRecord(payload)?.output) ?? asRecord(payload);
  const message =
    asString(output?.message) ??
    asString(output?.code) ??
    asString(asRecord(payload)?.message);
  return {
    status: normalizeTaskStatus(asString(output?.task_status) ?? asString(output?.status)),
    message,
    url:
      asString(output?.video_url) ??
      asString(output?.videoUrl) ??
      asString(output?.video) ??
      firstResultUrl(output),
  };
}

function normalizeTaskStatus(status: string | undefined): VideoTaskStatus {
  const value = status?.toUpperCase();
  if (
    value === 'PENDING' ||
    value === 'RUNNING' ||
    value === 'SUCCEEDED' ||
    value === 'FAILED' ||
    value === 'CANCELED'
  ) {
    return value;
  }
  return 'UNKNOWN';
}

function firstResultUrl(output: Record<string, unknown> | undefined): string | undefined {
  const results = Array.isArray(output?.results) ? output.results : [];
  for (const result of results) {
    const url = asString(asRecord(result)?.url);
    if (url) return url;
  }
  const urls = Array.isArray(output?.urls) ? output.urls : [];
  return asString(urls[0]);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

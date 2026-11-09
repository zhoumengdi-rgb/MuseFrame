import type { ImagePrompt } from './media.types.js';

export const DEFAULT_NEGATIVE_PROMPT =
  '低清晰度，模糊，噪点，过曝，色彩失真，结构畸形，多余的手指，多手多脚，错位肢体，文字水印，签名';

const MAX_POSITIVE_LENGTH = 600;
const MAX_NEGATIVE_LENGTH = 300;

export function fallbackImagePrompt(input: string): ImagePrompt {
  return {
    positive: normalizeText(input) || '一幅完整的画面',
    negative: DEFAULT_NEGATIVE_PROMPT,
  };
}

export function parseImagePrompt(raw: string, input: string): ImagePrompt {
  const data = extractJsonObject(raw);
  const positive = normalizeText(toText(data?.positive));
  if (!positive) return fallbackImagePrompt(input);

  const negative = normalizeText(toText(data?.negative));
  return {
    positive: clip(positive, MAX_POSITIVE_LENGTH),
    negative: clip(negative, MAX_NEGATIVE_LENGTH) || DEFAULT_NEGATIVE_PROMPT,
  };
}

function extractJsonObject(raw: string): Record<string, unknown> | undefined {
  const text = raw.replace(/```(?:json)?/giu, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').join('，');
  }
  return '';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

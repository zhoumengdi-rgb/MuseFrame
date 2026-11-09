import type { ChatMedia } from '../types';

export function toChatMedia(value: unknown): ChatMedia | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  if (kind !== 'image' && kind !== 'video') return null;

  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return null;

  return {
    kind,
    url,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
  };
}

export function toChatMediaList(value: unknown): ChatMedia[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toChatMedia(item))
    .filter((item): item is ChatMedia => item !== null);
}

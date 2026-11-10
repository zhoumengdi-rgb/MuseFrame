import type { ChatSummary } from '../types';

export function toChatSummary(value: unknown): ChatSummary | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const upTo = raw.upTo;
  if (!text || typeof upTo !== 'number' || !Number.isInteger(upTo) || upTo < 0) return null;
  return { text, upTo };
}

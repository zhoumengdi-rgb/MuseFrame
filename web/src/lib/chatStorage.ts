import { toChatMediaList } from './media';
import { toChatSummary } from './summary';
import type { ChatMessage, ChatSummary } from '../types';

const STORAGE_KEY = 'sse-chat-history';
const SUMMARY_KEY = 'sse-chat-summary';

export function loadHistory(): ChatMessage[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    return saved
      .filter(
        (item): item is ChatMessage =>
          !!item &&
          typeof item === 'object' &&
          ((item as ChatMessage).role === 'user' || (item as ChatMessage).role === 'assistant') &&
          typeof (item as ChatMessage).content === 'string',
      )
      .map(({ role, content, media }) => {
        const parsed = toChatMediaList(media);
        return parsed.length ? { role, content, media: parsed } : { role, content };
      });
  } catch {
    return [];
  }
}

export function saveHistory(messages: ChatMessage[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

export function loadSummary(): ChatSummary | null {
  try {
    return toChatSummary(JSON.parse(localStorage.getItem(SUMMARY_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

export function saveSummary(summary: ChatSummary | null): void {
  if (summary) {
    localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
  } else {
    localStorage.removeItem(SUMMARY_KEY);
  }
}

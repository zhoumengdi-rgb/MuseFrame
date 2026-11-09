import type { ChatMedia } from '../media/media.types.js';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  media?: ChatMedia[];
}

export type ChatStreamEvent =
  | { event: 'reasoning'; data: string }
  | { event: 'message'; data: string }
  | { event: 'status'; data: string }
  | { event: 'media'; data: ChatMedia }
  | { event: 'tool_call'; data: { name: string; arguments: Record<string, unknown> } }
  | {
      event: 'tool_result';
      data: { name: string; ok: boolean; content: string; durationMs: number };
    }
  | { event: 'error'; data: string }
  | { event: 'complete'; data: true };

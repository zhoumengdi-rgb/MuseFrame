export type ChatRole = 'user' | 'assistant';
export type MediaKind = 'image' | 'video';

export interface ChatMedia {
  kind: MediaKind;
  url: string;
  prompt: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  media?: ChatMedia[];
}

export interface PendingAnswer {
  reasoning: string;
  content: string;
  status: string;
  media: ChatMedia[];
}

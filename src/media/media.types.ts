export type MediaKind = 'image' | 'video';

export interface ChatMedia {
  kind: MediaKind;
  url: string;
  prompt: string;
}

export interface ImagePrompt {
  positive: string;
  negative: string;
}

export type VideoTaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'UNKNOWN';

export interface VideoTask {
  status: VideoTaskStatus;
  message?: string;
  url?: string;
}

import { useEffect, useRef } from 'react';
import type { ChatMessage, PendingAnswer } from '../types';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: ChatMessage[];
  pending: PendingAnswer | null;
  error: string | null;
  streaming: boolean;
}

export default function MessageList({ messages, pending, error, streaming }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, pending, error]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  };

  const isEmpty = !messages.length && !pending && !error;

  return (
    <div className="messages" ref={listRef} onScroll={handleScroll}>
      {isEmpty ? (
        <div className="empty">
          <div className="empty-icon">
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5z" />
            </svg>
          </div>
          <p className="empty-title">开始新的对话</p>
          <p className="empty-desc">输入问题开始对话，记录会自动保存在本地。</p>
        </div>
      ) : (
        <>
          {messages.map((message, index) => (
            <MessageBubble
              key={index}
              role={message.role}
              content={message.content}
              media={message.media}
            />
          ))}
          {pending && (
            <MessageBubble
              role="assistant"
              content={pending.content}
              reasoning={pending.reasoning}
              status={pending.status}
              media={pending.media}
              streaming={streaming}
            />
          )}
          {error && <MessageBubble role="assistant" content={`出错了：${error}`} error />}
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import ChatHeader from './components/ChatHeader';
import Composer from './components/Composer';
import MessageList from './components/MessageList';
import { loadHistory, saveHistory } from './lib/chatStorage';
import { toChatMedia } from './lib/media';
import { readSse } from './lib/sse';
import type { ChatMedia, ChatMessage, PendingAnswer } from './types';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [pending, setPending] = useState<PendingAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      if (streaming) return;

      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
      setMessages(nextMessages);
      setError(null);
      setPending({ reasoning: '', content: '', status: '', media: [] });
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const media: ChatMedia[] = [];
      let answer = '';
      try {
        const response = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: toApiMessages(nextMessages) }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error((await response.text()) || `HTTP ${response.status}`);
        }

        await readSse(response, (event, data) => {
          if (event === 'reasoning') {
            setPending((prev) => (prev ? { ...prev, reasoning: prev.reasoning + String(data) } : prev));
          } else if (event === 'status') {
            setPending((prev) => (prev ? { ...prev, status: String(data) } : prev));
          } else if (event === 'media') {
            const item = toChatMedia(data);
            if (item) {
              media.push(item);
              setPending((prev) => (prev ? { ...prev, media: [...prev.media, item] } : prev));
            }
          } else if (event === 'message') {
            answer += String(data);
            setPending((prev) => (prev ? { ...prev, content: answer } : prev));
          } else if (event === 'error') {
            throw new Error(String(data));
          }
        });

        if (answer.trim() || media.length) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: answer, ...(media.length ? { media } : {}) },
          ]);
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: '（模型没有返回内容）' }]);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // 用户主动停止：保留已生成的内容，什么都没生成时不留空消息
          if (answer.trim() || media.length) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: answer, ...(media.length ? { media } : {}) },
            ]);
          }
        } else {
          const message =
            err instanceof TypeError
              ? '网络连接失败，请确认服务已启动后重试。'
              : err instanceof Error
                ? err.message
                : String(err);
          setError(message);
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setPending(null);
      }
    },
    [messages, streaming],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClear = useCallback(() => {
    if (streaming) return;
    setMessages([]);
    setError(null);
  }, [streaming]);

  return (
    <div className="app">
      <ChatHeader onClear={handleClear} clearDisabled={streaming || !messages.length} />
      <MessageList messages={messages} pending={pending} error={error} streaming={streaming} />
      <Composer onSend={handleSend} onStop={handleStop} streaming={streaming} />
    </div>
  );
}

function toApiMessages(messages: ChatMessage[]) {
  return messages.map((message) =>
    message.role === 'assistant' && !message.content.trim() && message.media?.length
      ? {
          role: message.role,
          content: message.media
            .map((item) => `（此前已生成${item.kind === 'image' ? '图片' : '视频'}：${item.prompt}）`)
            .join('\n'),
        }
      : { role: message.role, content: message.content },
  );
}

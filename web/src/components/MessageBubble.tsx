import { useEffect, useRef } from 'react';
import { decorateContent, escapeHtml, renderMarkdown } from '../lib/markdown';
import type { ChatMedia, ChatRole } from '../types';

interface MessageBubbleProps {
  role: ChatRole;
  content: string;
  reasoning?: string;
  status?: string;
  media?: ChatMedia[];
  streaming?: boolean;
  error?: boolean;
}

export default function MessageBubble({
  role,
  content,
  reasoning = '',
  status = '',
  media,
  streaming = false,
  error = false,
}: MessageBubbleProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const isAssistant = role === 'assistant';
  const hasMedia = !!media?.length;
  const showStatus = isAssistant && !!status && !content && !hasMedia;
  const showTyping = isAssistant && streaming && !content && !hasMedia && !status;

  useEffect(() => {
    if (isAssistant && !error) {
      decorateContent(contentRef.current);
    }
  }, [isAssistant, content, error]);

  return (
    <div className={`msg ${role}`}>
      {isAssistant && (
        <div className="avatar" aria-hidden="true">
          AI
        </div>
      )}
      <div className="body">
        {reasoning && (
          <details className="reasoning-box">
            <summary>思考过程</summary>
            <div className="reasoning">{reasoning}</div>
          </details>
        )}
        {isAssistant ? (
          <>
            {showStatus && <p className="media-status">{status}</p>}
            {showTyping && (
              <div className="content markdown streaming">
                <span className="typing">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
            {content && (
              <div
                ref={contentRef}
                className={[
                  'content',
                  error ? 'error' : 'markdown',
                  streaming && content ? 'streaming has-text' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                dangerouslySetInnerHTML={{
                  __html: error ? escapeHtml(content) : renderMarkdown(content),
                }}
              />
            )}
            {media && media.length > 0 && (
              <div className="media-list">
                {media.map((item, index) => (
                  <figure className="media-item" key={`${item.kind}-${index}`}>
                    {item.kind === 'image' ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        <img src={item.url} alt={item.prompt || 'AI 生成图片'} loading="lazy" />
                      </a>
                    ) : (
                      <video src={item.url} controls playsInline preload="metadata" />
                    )}
                    {item.prompt && <figcaption>{item.prompt}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="content">{content}</div>
        )}
      </div>
    </div>
  );
}

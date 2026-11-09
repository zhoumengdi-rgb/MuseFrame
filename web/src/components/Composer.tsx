import { useEffect, useRef, useState } from 'react';

const MAX_INPUT_HEIGHT = 160;

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
}

export default function Composer({ onSend, onStop, streaming }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_INPUT_HEIGHT)}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    onSend(text);
    setValue('');
  };

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="输入问题…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          className={streaming ? 'send-btn stop-btn' : 'send-btn'}
          type={streaming ? 'button' : 'submit'}
          onClick={streaming ? onStop : undefined}
        >
          {streaming ? '停止生成' : '发送'}
        </button>
      </form>
      <p className="hint">Enter 发送 · Shift + Enter 换行 · 记录自动保存在本地</p>
    </div>
  );
}

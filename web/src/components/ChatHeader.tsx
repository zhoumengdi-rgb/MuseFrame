interface ChatHeaderProps {
  onClear: () => void;
  clearDisabled: boolean;
}

export default function ChatHeader({ onClear, clearDisabled }: ChatHeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="19"
            height="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 7V2.5H7" />
            <path d="M17 2.5h4.5V7" />
            <path d="M2.5 17v4.5H7" />
            <path d="M17 21.5h4.5V17" />
            <path d="M5 14.5l3.4-6.1 3.2 6.1 3.3-6.1 3.6 7" />
          </svg>
        </div>
        <div>
          <h1>MuseFrame</h1>
          <p>一句话，绘成图，变成片。</p>
        </div>
      </div>
      <button className="ghost-btn" type="button" onClick={onClear} disabled={clearDisabled}>
        清空记录
      </button>
    </header>
  );
}

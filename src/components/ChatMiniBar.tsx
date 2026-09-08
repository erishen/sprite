interface ChatMiniBarProps {
  title: string;
  onRestore: () => void;
  onClose: () => void;
}

/** 聊天面板最小化横条：标题 + 还原/关闭。 */
export function ChatMiniBar({ title, onRestore, onClose }: ChatMiniBarProps) {
  return (
    <div className="chat-mini-wrapper">
      <div className="minibar">
        <span className="minibar-title">{title}</span>
        <span className="minibar-actions">
          <button
            className="icon-btn"
            onClick={onRestore}
            title="还原（Esc）"
          >
            ⤢
          </button>
          <button className="icon-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </span>
      </div>
    </div>
  );
}

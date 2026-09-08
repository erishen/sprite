import { useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** ChatHeader 组件属性 */
export interface ChatHeaderProps {
  title: string;
  statusOk?: boolean;
  fullscreen?: boolean;
  onOpenSame?: () => void;
  onMinimize?: () => void;
  onFullscreen?: () => void;
  onClose?: () => void;
  onClear?: () => void;
  onExport?: () => void;
  children?: React.ReactNode;
}

/**
 * 聊天面板头部组件：显示标题、状态、最小化/全屏/关闭按钮。
 * 支持拖动（非按钮区域）。
 */
export function ChatHeader({
  title,
  statusOk = true,
  fullscreen = false,
  onOpenSame,
  onMinimize,
  onFullscreen,
  onClose,
  onClear,
  onExport,
  children,
}: ChatHeaderProps) {
  const appWindow = getCurrentWindow();
  const dragRef = useRef<HTMLDivElement | null>(null);

  /** 开始拖动窗口 */
  const startDrag = async (e: React.MouseEvent) => {
    // 如果点击的是交互元素（按钮、下拉框、输入框等），不拖动
    const target = e.target as HTMLElement;
    if (target.closest("button, select, input, textarea, a, [role='button']")) return;
    try {
      await appWindow.startDragging();
    } catch {
      // ignore
    }
  };

  return (
    <div
      ref={dragRef}
      className="chat-header"
      onMouseDown={startDrag}
      style={{ cursor: "grab" }}
    >
      {/* 第一行：状态灯 + 标题 + 模型选择 */}
      <div className="chat-header-row">
        <div className="chat-header-left">
          <span
            className="chat-header-status"
            style={{ backgroundColor: statusOk ? "#52C41A" : "#EA6668" }}
          />
          <span className="chat-header-title">{title}</span>
          {children && <div className="chat-header-children">{children}</div>}
        </div>
      </div>
      {/* 第二行：按钮组（靠右） */}
      <div className="chat-header-row chat-header-buttons-row">
        <div className="chat-header-right">
          {onOpenSame && (
            <button
              className="chat-header-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSame();
              }}
              title="新开同类型窗口"
            >
              +
            </button>
          )}
          {onClear && (
            <button
              className="chat-header-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              title="清空历史"
            >
              🗑
            </button>
          )}
          {onExport && (
            <button
              className="chat-header-btn"
              onClick={(e) => {
                e.stopPropagation();
                onExport();
              }}
              title="导出聊天记录（Markdown）"
            >
              📥
            </button>
          )}
          {onMinimize && (
            <button
              className="chat-header-btn"
              onClick={(e) => {
                e.stopPropagation();
                onMinimize();
              }}
              title="最小化"
            >
              —
            </button>
          )}
          {onFullscreen && (
            <button
              className="chat-header-btn"
              onClick={(e) => {
                e.stopPropagation();
                onFullscreen();
              }}
              title={fullscreen ? "还原" : "全屏"}
            >
              {fullscreen ? "⤢" : "⛶"}
            </button>
          )}
          {onClose && (
            <button
              className="chat-header-btn chat-header-close"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="关闭"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

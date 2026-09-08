import { useEffect, useRef } from "react";
import type { PromptTemplate } from "./PromptTemplates";

/** ChatInput 组件属性 */
export interface ChatInputProps {
  input: string;
  running?: boolean;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  prompts?: PromptTemplate[];
  onSelectPrompt?: (prompt: PromptTemplate) => void;
}

/**
 * 聊天输入框组件：包含输入框、发送按钮、停止按钮、提示词模板。
 * 支持 Enter 发送、Shift+Enter 换行、自动调整高度。
 */
export function ChatInput({
  input,
  running = false,
  placeholder = "输入消息...",
  inputRef: externalRef,
  onChange,
  onSend,
  onStop,
  onKeyDown,
  prompts = [],
  onSelectPrompt,
}: ChatInputProps) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalRef ?? internalRef;

  /** 自动调整输入框高度 */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input, textareaRef]);

  /** 处理键盘事件 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!running && input.trim()) {
        onSend();
      }
    }
  };

  return (
    <div className="chat-input-wrapper">
      {prompts.length > 0 && (
        <div className="chat-prompts">
          {prompts.map((p, i) => (
            <button
              key={`${p.label}-${i}`}
              className="chat-prompt-btn"
              onClick={() => onSelectPrompt?.(p)}
              title={p.text}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
        />
        {running && onStop ? (
          <button className="chat-send-btn chat-stop-btn" onClick={onStop} title="停止">
            ■
          </button>
        ) : (
          <button
            className="chat-send-btn"
            onClick={onSend}
            disabled={!input.trim() || running}
            title="发送"
          >
            ➤
          </button>
        )}
      </div>
    </div>
  );
}

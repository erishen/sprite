import { useCallback, useRef, useState } from "react";

/**
 * 聊天输入 hook：管理输入框状态、发送、停止、清空等逻辑。
 * @param onSend 发送消息的回调函数
 * @param onStop 停止生成的回调函数
 * @param running 是否正在生成中
 */
export function useChatInput(
  onSend: (text: string) => void,
  onStop: () => void,
  running: boolean,
) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /** 发送消息 */
  const send = useCallback(() => {
    const text = input.trim();
    if (!text || running) return;
    onSend(text);
    setInput("");
  }, [input, running, onSend]);

  /** 停止生成 */
  const stop = useCallback(() => {
    onStop();
  }, [onStop]);

  /** 清空输入 */
  const clear = useCallback(() => {
    setInput("");
  }, []);

  /** 设置输入（用于示例问题点击等） */
  const setText = useCallback((text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  }, []);

  /** 处理键盘事件（Enter 发送，Shift+Enter 换行） */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send],
  );

  /** 自动调整输入框高度 */
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  return {
    input,
    setInput,
    textareaRef,
    send,
    stop,
    clear,
    setText,
    handleKeyDown,
    autoResize,
  };
}

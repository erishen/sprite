import { useCallback, useRef, useState } from "react";

/**
 * Flash 提示 hook：显示一个短暂的提示消息，2 秒后自动消失。
 * 返回 [flash, notice]，flash(msg) 触发提示，notice 是当前提示消息。
 */
export function useFlash(): [(msg: string) => void, string | null] {
  const [notice, setNotice] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setNotice(null), 2000);
  }, []);

  return [flash, notice];
}

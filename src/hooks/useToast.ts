import { useCallback, useEffect, useState } from "react";

/** Toast 类型 */
export type ToastType = "success" | "error" | "warning" | "info";

/** Toast 项 */
export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

let toastId = 0;
let globalToasts: ToastItem[] = [];
const listeners = new Set<(toasts: ToastItem[]) => void>();
const timers = new Map<number, number>();

function notifyListeners() {
  for (const listener of listeners) {
    listener([...globalToasts]);
  }
}

function removeToastInternal(id: number) {
  globalToasts = globalToasts.filter((t) => t.id !== id);
  const timer = timers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timers.delete(id);
  }
  notifyListeners();
}

function addToastInternal(message: string, type: ToastType = "info", duration = 3000): number {
  const id = ++toastId;
  const item: ToastItem = { id, type, message, duration };
  globalToasts = [...globalToasts, item];
  notifyListeners();

  if (duration > 0) {
    const timer = window.setTimeout(() => removeToastInternal(id), duration);
    timers.set(id, timer);
  }

  return id;
}

/** 全局 toast 函数，可在任何地方调用 */
export const toast = {
  success: (msg: string, duration = 3000) => addToastInternal(msg, "success", duration),
  error: (msg: string, duration = 5000) => addToastInternal(msg, "error", duration),
  warning: (msg: string, duration = 4000) => addToastInternal(msg, "warning", duration),
  info: (msg: string, duration = 3000) => addToastInternal(msg, "info", duration),
  remove: removeToastInternal,
};

/**
 * Toast 管理 hook：订阅全局 toast 状态。
 * 返回 toasts 列表和 removeToast 函数。
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>(globalToasts);

  useEffect(() => {
    const listener = (newToasts: ToastItem[]) => setToasts(newToasts);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const removeToast = useCallback((id: number) => removeToastInternal(id), []);

  return { toasts, removeToast };
}

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 窗口类型 */
export type AppWindow = ReturnType<typeof getCurrentWindow>;

/**
 * 自实现拖拽：非交互元素上按下左键 → startDragging。
 * 比 -webkit-app-region: drag 更可靠，在子窗口下也能正常工作。
 */
export function useDragWindow(appWindow: AppWindow) {
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // 交互元素（按钮/输入框/链接等）不触发拖动
      if (
        t.closest(
          "button, input, textarea, select, a, [role='button'], [contenteditable]"
        )
      )
        return;
      appWindow
        .startDragging()
        .catch((err: unknown) => console.error("[sprite] startDragging failed:", err));
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [appWindow]);
}

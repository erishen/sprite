import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 关闭当前子窗口：优先调用 Rust 侧 close_panel 命令（更可靠），失败时回退到前端 Window.close()。
 * 前端 Window.close() 在 Tauri v2 无边框透明窗口下不可靠，所以优先用 Rust 侧。
 */
export function closeCurrentWindow(label: string) {
  invoke("close_panel", { label })
    .catch((e) => {
      console.error("[sprite] Rust 关闭失败，回退前端 close():", label, e);
      getCurrentWindow()
        .close()
        .catch((e2) => console.error("[sprite] 前端关闭也失败:", label, e2));
    });
}

import { useCallback, useEffect, useRef, useState } from "react";
import { PhysicalPosition, PhysicalSize, type Window } from "@tauri-apps/api/window";

/**
 * 最小化到顶部横条：点 ─ 后窗口缩成 360×36 的小横条
 * 直接使用窗口当前位置，不需要判断显示器（多显示器环境下更可靠）
 * 按 Esc 或点 ⤢ 还原。
 * 横条内容由调用方渲染（HUD 横条含 H/S/R 快捷开窗；子窗口横条含标题）。
 */
const MIN_W = 360;
const MIN_H = 36;

/** 最小化后的水平位置 */
export type MiniPosition = "left" | "center" | "right";

export function useMinimize(
  appWindow: Window,
  onRestore?: () => void,
  width?: number,
  position: MiniPosition = "right",
  rightOffset?: number,  // 右侧位置时，距离窗口右边的偏移量（默认 0）
): [boolean, () => Promise<void>] {
  const [minimized, setMinimized] = useState(false);
  const saved = useRef<{ size: PhysicalSize | null; pos: PhysicalPosition | null } | null>(null);
  const miniWidth = width ?? MIN_W;
  const offset = rightOffset ?? 0;

  const toggle = useCallback(async () => {
    try {
      if (saved.current) {
        // 还原：恢复记忆的尺寸与位置（直接使用保存的 PhysicalSize/PhysicalPosition 对象）
        const s = saved.current;
        saved.current = null;
        if (s.size) await appWindow.setSize(s.size);
        if (s.pos) await appWindow.setPosition(s.pos);
        // 确保还原后窗口保持置顶（延迟一点设置，确保窗口大小和位置设置完成后再设置置顶）
        setTimeout(() => {
          appWindow.setAlwaysOnTop(true).catch(() => {});
        }, 100);
        setMinimized(false);
        onRestore?.();
        return;
      }
      // 缩小：记忆原尺寸/位置，直接使用窗口当前位置缩小成横条
      const size = await appWindow.outerSize();
      const pos = await appWindow.outerPosition();
      saved.current = { size, pos };

      // 获取窗口的缩放比例，将逻辑像素转换成物理像素
      const scale = await appWindow.scaleFactor().catch(() => 1);

      // 直接使用窗口当前位置，不需要判断显示器
      // x 坐标：根据 position 调整（相对于窗口当前位置）
      const miniW = Math.round(miniWidth * scale); // 物理像素
      const miniH = Math.round(MIN_H * scale); // 物理像素
      const offsetPx = Math.round(offset * scale); // 偏移量转换成物理像素
      let mx: number;
      switch (position) {
        case "left":
          // 左侧：保持窗口当前的 x 坐标，向右偏移 offset
          mx = pos.x + offsetPx;
          break;
        case "center":
          // 中央：居中对齐（相对于原窗口）
          mx = pos.x + Math.round((size.width - miniW) / 2);
          break;
        case "right":
        default:
          // 右侧：靠右对齐（相对于原窗口），再向左偏移 offset
          mx = pos.x + (size.width - miniW) - offsetPx;
          break;
      }
      // y 坐标：直接使用窗口当前的 y 坐标
      const my = pos.y;

      await appWindow.setSize(new PhysicalSize(miniW, miniH));
      await appWindow.setPosition(new PhysicalPosition(mx, my));
      // 确保最小化后窗口保持置顶（延迟一点设置，确保窗口大小和位置设置完成后再设置置顶）
      setTimeout(() => {
        appWindow.setAlwaysOnTop(true).catch(() => {});
      }, 100);
      setMinimized(true);
    } catch (e) {
      console.error("最小化失败", e);
    }
  }, [appWindow, onRestore, miniWidth, position, offset]);

  // Esc 还原（窗口聚焦时）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && saved.current) {
        void toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // 监听显示器状态变化（合屏/开屏、多显示器切换等）
  // 合屏后屏幕参数可能变化，之前保存的位置可能失效，需要更新保存的值
  useEffect(() => {
    let rafId = 0;
    const handler = () => {
      if (!saved.current) return;
      // 延迟执行，等显示器状态稳定
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(async () => {
        try {
          // 用当前实际窗口状态更新保存的值，确保恢复时位置正确
          const currentSize = await appWindow.outerSize();
          const currentPos = await appWindow.outerPosition();
          saved.current = { size: currentSize, pos: currentPos };
        } catch {
          // 静默失败，不影响正常使用
        }
      });
    };

    // macOS displayChange 通过 matchMedia 监听
    const displayQuery = window.matchMedia("(display-change: active)");
    const onDisplayChange = () => handler();
    displayQuery.addEventListener?.("change", onDisplayChange);

    // 兜底：监听 window resize 和 focus 事件
    window.addEventListener("resize", handler);
    window.addEventListener("focus", handler);

    return () => {
      displayQuery.removeEventListener?.("change", onDisplayChange);
      window.removeEventListener("resize", handler);
      window.removeEventListener("focus", handler);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [appWindow]);

  return [minimized, toggle];
}

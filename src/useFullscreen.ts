import { useCallback, useEffect, useRef, useState } from "react";
import { LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, type Window } from "@tauri-apps/api/window";

/**
 * 自定义"全屏"（铺满当前显示器）hook，供独立小窗复用。
 * 不用 macOS 原生 fullscreen：原生全屏独占 Space 且 透明+全屏 是已知黑屏组合。
 * 还原时恢复全屏前的尺寸与位置；窗口在副屏时铺满副屏（用显示器自己的坐标）。
 * Esc 也可退出全屏。
 */
export function useFullscreen(
  appWindow: Window,
  onRestore?: () => void,
): [boolean, () => Promise<void>] {
  const [fs, setFs] = useState(false);
  const fsRef = useRef(false);
  const frame = useRef<{ size: PhysicalSize | null; pos: PhysicalPosition | null }>({
    size: null,
    pos: null,
  });

  const toggle = useCallback(async () => {
    try {
      if (!fsRef.current) {
        frame.current.size = await appWindow.outerSize();
        frame.current.pos = await appWindow.outerPosition();
        const monitor = await currentMonitor();
        if (!monitor) throw new Error("未找到显示器");
        // 避开 macOS 顶部菜单栏（约 24 逻辑 px），否则窗口头部内容会被菜单栏盖住
        const MENU_BAR_H = 24;
        const w = monitor.size.width / monitor.scaleFactor;
        const h = monitor.size.height / monitor.scaleFactor - MENU_BAR_H;
        const x = monitor.position.x / monitor.scaleFactor;
        const y = monitor.position.y / monitor.scaleFactor + MENU_BAR_H;
        await appWindow.setSize(new LogicalSize(w, h));
        await appWindow.setPosition(new LogicalPosition(x, y));
        fsRef.current = true;
        setFs(true);
      } else {
        if (frame.current.size) await appWindow.setSize(frame.current.size);
        if (frame.current.pos) await appWindow.setPosition(frame.current.pos);
        fsRef.current = false;
        setFs(false);
        onRestore?.();
      }
    } catch (e) {
      console.error("全屏切换失败", e);
    }
  }, [appWindow, onRestore]);

  // Esc 退出全屏（用 ref 避免重复注册监听）
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fsRef.current) void toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return [fs, toggle];
}

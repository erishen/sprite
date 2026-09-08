import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow, currentMonitor, PhysicalSize } from "@tauri-apps/api/window";

/**
 * 窗口调整大小 hook
 * 提供调整大小的手柄，拖动时调整窗口大小
 * 使用 screenX/screenY（相对于屏幕的坐标），避免窗口大小变化导致鼠标相对坐标变化，引起抖动
 * 使用 requestAnimationFrame 节流，避免频繁调用 setSize 导致抖动
 * 调整大小时临时禁用内容滚动，避免滚动条出现/消失导致内容高度变化，引起抖动
 * @param minWidth 最小宽度（逻辑像素）
 * @param minHeight 最小高度（逻辑像素）
 * @param direction 调整方向：'horizontal'（只调宽度）、'vertical'（只调高度）、'both'（宽高都调）
 */
export function useWindowResize(
  minWidth = 340,
  minHeight = 400,
  direction: "horizontal" | "vertical" | "both" = "both"
) {
  const appWindow = getCurrentWindow();
  const resizingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const startSizeRef = useRef({ width: 0, height: 0 });
  const scaleFactorRef = useRef(1);
  const initializedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingSizeRef = useRef<{ width: number; height: number } | null>(null);
  const prevOverflowRef = useRef<string>("");

  /** 开始调整大小 */
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // 立即开始调整，不需要等待异步获取
      resizingRef.current = true;
      initializedRef.current = false;
      // 使用 screenX/screenY（相对于屏幕的坐标），避免窗口大小变化导致鼠标相对坐标变化
      startPosRef.current = { x: e.screenX, y: e.screenY };

      // 临时禁用内容滚动，避免滚动条出现/消失导致内容高度变化，引起抖动
      const hud = document.querySelector(".hud") as HTMLElement | null;
      if (hud) {
        prevOverflowRef.current = hud.style.overflowY;
        hud.style.overflowY = "hidden";
      }

      document.body.style.cursor = direction === "horizontal" ? "ew-resize" : direction === "vertical" ? "ns-resize" : "nwse-resize";
      document.body.style.userSelect = "none";

      // 异步获取当前窗口大小和 scale factor
      Promise.all([appWindow.innerSize(), currentMonitor()])
        .then(([size, monitor]) => {
          startSizeRef.current = { width: size.width, height: size.height };
          scaleFactorRef.current = monitor ? monitor.scaleFactor : 1;
          initializedRef.current = true;
        })
        .catch(() => {
          // 获取失败，使用默认值
          startSizeRef.current = { width: 420 * 2, height: 500 * 2 };
          scaleFactorRef.current = 2;
          initializedRef.current = true;
        });
    },
    [appWindow, direction]
  );

  /** 实际执行窗口大小调整（用 requestAnimationFrame 节流，避免频繁调用导致抖动） */
  const applySize = useCallback(() => {
    if (!pendingSizeRef.current) return;
    const { width, height } = pendingSizeRef.current;
    pendingSizeRef.current = null;
    appWindow
      .setSize(new PhysicalSize(width, height))
      .catch(() => {
        // ignore
      });
  }, [appWindow]);

  /** 处理鼠标移动，调整窗口大小 */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      if (!initializedRef.current) return; // 还没获取到初始大小

      const scale = scaleFactorRef.current;
      // 使用 screenX/screenY（相对于屏幕的坐标）
      const deltaX = (e.screenX - startPosRef.current.x) * scale;
      const deltaY = (e.screenY - startPosRef.current.y) * scale;

      let newWidth = startSizeRef.current.width;
      let newHeight = startSizeRef.current.height;

      if (direction === "horizontal" || direction === "both") {
        newWidth = Math.max(minWidth * scale, startSizeRef.current.width + deltaX);
      }
      if (direction === "vertical" || direction === "both") {
        newHeight = Math.max(minHeight * scale, startSizeRef.current.height + deltaY);
      }

      // 用 requestAnimationFrame 节流，避免频繁调用 setSize 导致抖动
      pendingSizeRef.current = { width: newWidth, height: newHeight };
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          applySize();
        });
      }
    };

    const handleMouseUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      initializedRef.current = false;
      // 执行最后一次大小调整
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      applySize();
      // 恢复内容滚动
      const hud = document.querySelector(".hud") as HTMLElement | null;
      if (hud) {
        hud.style.overflowY = prevOverflowRef.current;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      // 确保恢复内容滚动
      const hud = document.querySelector(".hud") as HTMLElement | null;
      if (hud) {
        hud.style.overflowY = prevOverflowRef.current;
      }
    };
  }, [appWindow, minWidth, minHeight, direction, applySize]);

  return { startResize };
}

import { useEffect, useState } from "react";

/** localStorage 键名 */
const DEBUG_MODE_KEY = "sprite-debug-mode";

/**
 * 调试模式 hook：控制是否展示私有配置（launchers.local.json / prompts.local.json）。
 * 状态持久化到 localStorage，主窗口和设置窗口之间共享。
 *
 * - 关闭（默认）：只展示公开配置（public），隐藏私有配置
 * - 开启：展示公开配置 + 私有配置（local）
 */
export function useDebugMode() {
  const [debugMode, setDebugMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEBUG_MODE_KEY) === "true";
    } catch {
      return false;
    }
  });

  // 持久化到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(DEBUG_MODE_KEY, String(debugMode));
    } catch {
      // ignore
    }
  }, [debugMode]);

  // 监听其他窗口的 storage 事件，保持多窗口同步
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === DEBUG_MODE_KEY) {
        setDebugMode(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const toggle = () => setDebugMode((v) => !v);

  return {
    debugMode,
    setDebugMode,
    toggle,
    showPrivate: debugMode,
  };
}

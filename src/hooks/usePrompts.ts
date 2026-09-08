import { useEffect, useState } from "react";
import publicPrompts from "../config/prompts.public.json";
import type { PromptTemplate } from "../components/PromptTemplates";

/** localStorage 键名（与 useDebugMode 保持一致） */
const DEBUG_MODE_KEY = "sprite-debug-mode";

/** 读取当前调试模式状态 */
function isDebugMode(): boolean {
  try {
    return localStorage.getItem(DEBUG_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * 加载提示词模板：公开配置（静态 import，HMR 自动刷新）+ 本地私密配置（动态 import，不存在时忽略）。
 *
 * 调试模式关闭时，只展示公开配置（prompts.public.json）；
 * 调试模式开启时，展示公开配置 + 私有配置（prompts.local.json）。
 * 调试模式状态通过 localStorage 与设置页面共享。
 */
export function usePrompts(): PromptTemplate[] {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [showPrivate, setShowPrivate] = useState<boolean>(isDebugMode);

  // 监听 storage 事件，保持多窗口同步
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === DEBUG_MODE_KEY) {
        setShowPrivate(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    let alive = true;

    if (!showPrivate) {
      // 只展示公开配置
      if (alive) setPrompts([...(publicPrompts as PromptTemplate[])]);
      return;
    }

    // 展示公开配置 + 私有配置
    import("../config/prompts.local.json")
      .then((m) => m.default as PromptTemplate[])
      .catch(() => [] as PromptTemplate[])
      .then((loc) => {
        if (alive) setPrompts([...(publicPrompts as PromptTemplate[]), ...loc]);
      });
    return () => {
      alive = false;
    };
  }, [publicPrompts, showPrivate]);

  return prompts;
}

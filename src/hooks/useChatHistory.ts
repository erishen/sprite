import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** 聊天历史项 */
export interface HistoryItem {
  id: string;
  title: string;
  timestamp: number;
  messages: Array<{ role: string; content: string }>;
}

/**
 * 聊天历史 hook：加载、保存、删除聊天历史。
 * @param windowLabel 窗口标签（用于区分不同面板的历史）
 */
export function useChatHistory(windowLabel: string) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  /** 加载历史 */
  const loadHistory = useCallback(async () => {
    try {
      const items = await invoke<HistoryItem[]>("history_list", { windowLabel });
      setHistory(items);
    } catch {
      setHistory([]);
    } finally {
      setLoaded(true);
    }
  }, [windowLabel]);

  /** 保存当前对话为历史 */
  const saveHistory = useCallback(
    async (title: string, messages: Array<{ role: string; content: string }>) => {
      try {
        const id = await invoke<string>("history_save", {
          windowLabel,
          title,
          messages,
        });
        await loadHistory();
        return id;
      } catch {
        return null;
      }
    },
    [windowLabel, loadHistory],
  );

  /** 删除历史 */
  const deleteHistory = useCallback(
    async (id: string) => {
      try {
        await invoke("history_delete", { windowLabel, id });
        setHistory((prev) => prev.filter((h) => h.id !== id));
      } catch {
        // ignore
      }
    },
    [windowLabel],
  );

  /** 清空历史 */
  const clearHistory = useCallback(async () => {
    try {
      await invoke("history_clear", { windowLabel });
      setHistory([]);
    } catch {
      // ignore
    }
  }, [windowLabel]);

  /** 加载历史 */
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return {
    history,
    loaded,
    loadHistory,
    saveHistory,
    deleteHistory,
    clearHistory,
  };
}

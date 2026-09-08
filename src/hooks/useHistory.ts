import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * 对话历史持久化：挂载时从本地 JSON 加载（可选），turns 变化时防抖保存（500ms）。
 * 每个窗口 label 对应一个历史文件，重启后可恢复。
 *
 * @param label 窗口 label（历史文件的唯一标识）
 * @param turns 当前对话列表
 * @param setTurns 设置对话列表的函数
 * @param autoLoad 是否在挂载时自动加载历史记录（默认 true）。
 *                  设为 false 时，每次打开新窗口都是全新对话，但同一个窗口内的对话历史仍会保存（用于刷新页面时恢复）。
 */
export function useHistory<T>(
  label: string,
  turns: T[],
  setTurns: (t: T[]) => void,
  autoLoad: boolean = true,
) {
  // 挂载时加载历史（仅当 autoLoad 为 true 时）
  useEffect(() => {
    if (!autoLoad) return;
    let alive = true;
    invoke<string | null>("load_history", { label })
      .then((json) => {
        if (alive && json) {
          try {
            setTurns(JSON.parse(json) as T[]);
          } catch (e) {
            console.error("[sprite] 解析历史失败:", e);
          }
        }
      })
      .catch((e) => console.error("[sprite] 加载历史失败:", e));
    return () => {
      alive = false;
    };
  }, [label, setTurns, autoLoad]);

  // turns 变化时防抖保存
  useEffect(() => {
    const timer = setTimeout(() => {
      invoke("save_history", { label, json: JSON.stringify(turns) }).catch((e) =>
        console.error("[sprite] 保存历史失败:", e),
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [label, turns]);
}

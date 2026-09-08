/**
 * 数据管理工具函数
 * 支持导出所有用户数据和清除所有数据
 */

import { invoke } from "@tauri-apps/api/core";

/** 导出的数据结构 */
export interface ExportedData {
  version: string;
  exportedAt: string;
  settings: unknown;
  localStorage: Record<string, string>;
  customItems: unknown;
}

/**
 * 导出所有用户数据
 * @returns 导出的数据对象
 */
export async function exportAllData(): Promise<ExportedData> {
  // 1. 导出设置
  let settings: unknown = null;
  try {
    settings = await invoke("load_settings");
  } catch (e) {
    console.error("[sprite] 导出设置失败:", e);
  }

  // 2. 导出 localStorage
  const localStorageData: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        localStorageData[key] = localStorage.getItem(key) || "";
      }
    }
  } catch (e) {
    console.error("[sprite] 导出 localStorage 失败:", e);
  }

  // 3. 导出自定义条目（密码箱）
  let customItems: unknown = null;
  try {
    const customItemsStr = localStorage.getItem("sprite_custom_items");
    if (customItemsStr) {
      customItems = JSON.parse(customItemsStr);
    }
  } catch (e) {
    console.error("[sprite] 导出密码箱失败:", e);
  }

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    settings,
    localStorage: localStorageData,
    customItems,
  };
}

/**
 * 导出数据到文件
 * 使用 Blob + a 标签下载，不需要额外的 Tauri 插件
 */
export async function exportDataToFile(): Promise<boolean> {
  try {
    const data = await exportAllData();
    const jsonStr = JSON.stringify(data, null, 2);

    // 创建 Blob
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // 创建 a 标签触发下载
    const a = document.createElement("a");
    a.href = url;
    a.download = `sprite-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 释放 URL
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    console.log("[sprite] 数据导出成功");
    return true;
  } catch (e) {
    console.error("[sprite] 数据导出失败:", e);
    return false;
  }
}

/**
 * 清除所有用户数据
 * 包括：localStorage、设置文件、密码箱等
 * @param confirm 用户确认字符串（必须输入 "DELETE" 才执行）
 * @returns 是否成功清除
 */
export async function clearAllData(confirm: string): Promise<boolean> {
  if (confirm !== "DELETE") {
    console.error("[sprite] 清除数据失败：确认字符串不正确");
    return false;
  }

  try {
    // 1. 清除 localStorage
    localStorage.clear();
    console.log("[sprite] localStorage 已清除");

    // 2. 重置设置（通过保存默认设置）
    try {
      const defaultSettings = {
        app_title: "ESN",
        pomodoro_enabled: true,
        system_monitor_enabled: true,
        clipboard_history_enabled: true,
        builtin: { base_url: "", api_key: "", model: "" },
        resolve: { base_url: "" },
        spring: { base_url: "", model: "" },
        harness: { base_url: "", api_token: "", model: "" },
      };
      await invoke("save_settings", { settings: defaultSettings });
      console.log("[sprite] 设置已重置为默认值");
    } catch (e) {
      console.error("[sprite] 重置设置失败:", e);
    }

    return true;
  } catch (e) {
    console.error("[sprite] 清除数据失败:", e);
    return false;
  }
}

/**
 * 获取数据存储信息
 * @returns 数据存储信息（大小、条目数等）
 */
export function getDataStorageInfo(): {
  localStorageSize: number;
  localStorageCount: number;
  customItemsCount: number;
} {
  let localStorageSize = 0;
  let localStorageCount = 0;
  let customItemsCount = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || "";
        localStorageSize += key.length + value.length;
        localStorageCount++;
      }
    }

    const customItemsStr = localStorage.getItem("sprite_custom_items");
    if (customItemsStr) {
      const customItems = JSON.parse(customItemsStr);
      if (Array.isArray(customItems)) {
        customItemsCount = customItems.length;
      }
    }
  } catch (e) {
    console.error("[sprite] 获取数据存储信息失败:", e);
  }

  return {
    localStorageSize,
    localStorageCount,
    customItemsCount,
  };
}

import { useCallback, useEffect, useState } from "react";
import { encrypt, decrypt } from "../utils/crypto";

/** 自定义配置项 */
export interface CustomItem {
  id: string;
  label: string;   // 按钮文案（显示在前面）
  content: string; // 加密后的内容
}

const STORAGE_KEY = "sprite_custom_items";

/** 生成唯一 ID */
function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 自定义配置项管理 hook
 * 数据存储在 localStorage，内容加密存储
 * 支持主密码验证：如果启用了主密码，需要验证后才能访问内容
 */
export function useCustomItems(masterPasswordEnabled?: boolean, masterPassword?: string) {
  const enabled = masterPasswordEnabled ?? false;
  const password = masterPassword ?? "";
  const [items, setItems] = useState<CustomItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(!enabled);

  // 主密码状态变化时，更新解锁状态
  useEffect(() => {
    if (!enabled) {
      setUnlocked(true);
    } else {
      setUnlocked(false);
    }
  }, [enabled]);

  // 验证主密码
  const verifyMasterPassword = useCallback((pwd: string): boolean => {
    if (!enabled) return true;
    return pwd === password;
  }, [enabled, password]);

  // 解锁密码箱
  const unlock = useCallback((pwd: string): boolean => {
    if (verifyMasterPassword(pwd)) {
      setUnlocked(true);
      return true;
    }
    return false;
  }, [verifyMasterPassword]);

  // 锁定密码箱
  const lock = useCallback(() => {
    if (enabled) {
      setUnlocked(false);
    }
  }, [enabled]);

  // 从 localStorage 加载
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setItems(JSON.parse(raw));
      }
    } catch (e) {
      console.error("[sprite] 加载自定义配置失败:", e);
    }
    setLoaded(true);
  }, []);

  // 保存到 localStorage
  const persist = useCallback((newItems: CustomItem[]) => {
    setItems(newItems);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
  }, []);

  /** 添加新配置项 */
  const add = useCallback(
    async (label: string, content: string) => {
      if (enabled && !unlocked) {
        throw new Error("密码箱已锁定，请先解锁");
      }
      const encrypted = await encrypt(content);
      const newItem: CustomItem = {
        id: genId(),
        label: label.trim(),
        content: encrypted,
      };
      persist([...items, newItem]);
      return newItem;
    },
    [items, persist, enabled, unlocked],
  );

  /** 更新配置项 */
  const update = useCallback(
    async (id: string, label: string, content: string) => {
      if (enabled && !unlocked) {
        throw new Error("密码箱已锁定，请先解锁");
      }
      const encrypted = await encrypt(content);
      const newItems = items.map((item) =>
        item.id === id ? { ...item, label: label.trim(), content: encrypted } : item,
      );
      persist(newItems);
    },
    [items, persist, enabled, unlocked],
  );

  /** 删除配置项 */
  const remove = useCallback(
    (id: string) => {
      if (enabled && !unlocked) {
        throw new Error("密码箱已锁定，请先解锁");
      }
      persist(items.filter((item) => item.id !== id));
    },
    [items, persist, enabled, unlocked],
  );

  /** 获取解密后的内容 */
  const getContent = useCallback(async (item: CustomItem): Promise<string> => {
    if (enabled && !unlocked) {
      throw new Error("密码箱已锁定，请先解锁");
    }
    return decrypt(item.content);
  }, [enabled, unlocked]);

  return {
    items,
    loaded,
    unlocked,
    unlock,
    lock,
    verifyMasterPassword,
    add,
    update,
    remove,
    getContent,
  };
}

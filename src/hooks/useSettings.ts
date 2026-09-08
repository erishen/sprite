import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  loadApiKeysFromKeychain,
  saveApiKeyToKeychain,
  isKeychainAvailable,
} from "../utils/keychain";

/** 内置 LLM 配置 */
export interface BuiltinConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Resolve Studio 后端配置 */
export interface ResolveConfig {
  baseUrl: string;
}

/** Spring Harness 后端配置 */
export interface SpringConfig {
  baseUrl: string;
  model: string;
}

/** Resolve Harness 后端配置 */
export interface HarnessConfig {
  baseUrl: string;
  apiToken: string;
  model: string;
}

/** 完整设置结构（前端用 camelCase，Rust 侧用 snake_case，serde 自动转换） */
export interface Settings {
  appTitle: string;
  pomodoroEnabled: boolean;
  systemMonitorEnabled: boolean;
  clipboardHistoryEnabled: boolean;
  hotkey: string;
  lockEnabled: boolean;
  lockPassword: string;
  autoLockMinutes: number;
  masterPasswordEnabled: boolean;
  masterPassword: string;
  useKeychain: boolean;
  builtin: BuiltinConfig;
  resolve: ResolveConfig;
  spring: SpringConfig;
  harness: HarnessConfig;
}

/** 默认设置（空值，用户需要在设置页面配置） */
const DEFAULT_SETTINGS: Settings = {
  appTitle: "ESN",
  pomodoroEnabled: true,
  systemMonitorEnabled: true,
  clipboardHistoryEnabled: true,
  hotkey: "Cmd+Option+D",
  lockEnabled: false,
  lockPassword: "",
  autoLockMinutes: 0,
  masterPasswordEnabled: false,
  masterPassword: "",
  useKeychain: false,
  builtin: { baseUrl: "", apiKey: "", model: "" },
  resolve: { baseUrl: "" },
  spring: { baseUrl: "", model: "" },
  harness: { baseUrl: "", apiToken: "", model: "" },
};

/**
 * 设置管理 hook：加载/保存用户配置到本地 JSON 文件。
 * 配置存储在 app_data_dir/settings.json，打包后也能修改，不依赖 .env。
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // 加载设置
  const loadSettings = useCallback(async () => {
    try {
      const s = await invoke<Settings>("load_settings");
      let loadedSettings = s || DEFAULT_SETTINGS;

      // 如果启用了 Keychain，从 Keychain 加载 API Key
      if (loadedSettings.useKeychain) {
        try {
          const keychainAvailable = await isKeychainAvailable();
          if (keychainAvailable) {
            const apiKeys = await loadApiKeysFromKeychain();
            loadedSettings = {
              ...loadedSettings,
              builtin: {
                ...loadedSettings.builtin,
                apiKey: apiKeys.builtinApiKey || loadedSettings.builtin.apiKey,
              },
              harness: {
                ...loadedSettings.harness,
                apiToken: apiKeys.harnessApiToken || loadedSettings.harness.apiToken,
              },
            };
          }
        } catch (keychainError) {
          console.error("[sprite] 从 Keychain 加载 API Key 失败:", keychainError);
        }
      }

      setSettings(loadedSettings);
      setLoaded(true);
    } catch (e) {
      console.error("[sprite] 加载设置失败:", e);
      setLoaded(true);
    }
  }, []);

  // 记录上一次的设置，用于检测变化
  const lastSettingsRef = useRef<string>("");

  useEffect(() => {
    let alive = true;
    loadSettings().then(() => {
      if (!alive) return;
    });

    // 监听 settings-updated 事件，收到事件后立即重新加载设置（实时更新）
    let unlisten: (() => void) | null = null;
    listen("settings-updated", () => {
      if (!alive) return;
      void loadSettings();
    }).then((fn) => {
      unlisten = fn;
    });

    // 定期轮询设置（每 30 秒检查一次），其他窗口保存设置后自动更新
    // 注：Rust 侧已实现 settings-updated 事件，轮询仅作为兜底机制，频率降低以减少 CPU 占用
    const interval = setInterval(async () => {
      try {
        const s = await invoke<Settings>("load_settings");
        let loadedSettings = s || DEFAULT_SETTINGS;

        // 如果启用了 Keychain，从 Keychain 加载 API Key
        if (loadedSettings.useKeychain) {
          try {
            const keychainAvailable = await isKeychainAvailable();
            if (keychainAvailable) {
              const apiKeys = await loadApiKeysFromKeychain();
              loadedSettings = {
                ...loadedSettings,
                builtin: {
                  ...loadedSettings.builtin,
                  apiKey: apiKeys.builtinApiKey || loadedSettings.builtin.apiKey,
                },
                harness: {
                  ...loadedSettings.harness,
                  apiToken: apiKeys.harnessApiToken || loadedSettings.harness.apiToken,
                },
              };
            }
          } catch (keychainError) {
            console.error("[sprite] 从 Keychain 加载 API Key 失败:", keychainError);
          }
        }

        const currentJson = JSON.stringify(loadedSettings);
        // 只有设置变化时才更新状态，避免不必要的重渲染
        if (currentJson !== lastSettingsRef.current) {
          lastSettingsRef.current = currentJson;
          setSettings(loadedSettings);
          setLoaded(true);
        }
      } catch (e) {
        console.error("[sprite] 轮询设置失败:", e);
      }
    }, 30000);
    return () => {
      alive = false;
      clearInterval(interval);
      if (unlisten) unlisten();
    };
  }, [loadSettings]);

  // 保存设置
  const save = useCallback(async (newSettings: Settings) => {
    setSaving(true);
    try {
      // 如果启用了 Keychain，将 API Key 保存到 Keychain
      if (newSettings.useKeychain) {
        try {
          const keychainAvailable = await isKeychainAvailable();
          if (keychainAvailable) {
            // 保存各个 API Key 到 Keychain
            if (newSettings.builtin.apiKey) {
              await saveApiKeyToKeychain("builtin", newSettings.builtin.apiKey);
            }
            if (newSettings.harness.apiToken) {
              await saveApiKeyToKeychain("harness", newSettings.harness.apiToken);
            }
            console.log("[sprite] API Key 已保存到 Keychain");
          }
        } catch (keychainError) {
          console.error("[sprite] 保存 API Key 到 Keychain 失败:", keychainError);
        }
      }

      await invoke("save_settings", { settings: newSettings });
      setSettings(newSettings);
      return true;
    } catch (e) {
      console.error("[sprite] 保存设置失败:", e);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  // 更新部分设置
  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const newSettings = { ...settings, ...patch };
      return save(newSettings);
    },
    [settings, save],
  );

  return {
    settings,
    loaded,
    saving,
    save,
    update,
    setSettings,
  };
}

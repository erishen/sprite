/**
 * Keychain 工具函数
 *
 * 用于在前端调用 Rust 后端的 Keychain 命令，
 * 实现 API Key 等敏感信息的安全存储。
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * 检查 Keychain 是否可用
 * @returns 是否可用
 */
export async function isKeychainAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("keychain_available");
  } catch (error) {
    console.error("检查 Keychain 可用性失败:", error);
    return false;
  }
}

/**
 * 保存密码到 Keychain
 * @param account 账户名称
 * @param password 密码
 * @returns 是否保存成功
 */
export async function saveToKeychain(account: string, password: string): Promise<boolean> {
  try {
    await invoke("keychain_save", { account, password });
    return true;
  } catch (error) {
    console.error(`保存密码到 Keychain 失败 (${account}):`, error);
    return false;
  }
}

/**
 * 从 Keychain 读取密码
 * @param account 账户名称
 * @returns 密码，如果不存在则返回 null
 */
export async function getFromKeychain(account: string): Promise<string | null> {
  try {
    const result = await invoke<Option<string>>("keychain_get", { account });
    return result ?? null;
  } catch (error) {
    console.error(`从 Keychain 读取密码失败 (${account}):`, error);
    return null;
  }
}

/**
 * 从 Keychain 删除密码
 * @param account 账户名称
 * @returns 是否删除成功
 */
export async function deleteFromKeychain(account: string): Promise<boolean> {
  try {
    await invoke("keychain_delete", { account });
    return true;
  } catch (error) {
    console.error(`从 Keychain 删除密码失败 (${account}):`, error);
    return false;
  }
}

/**
 * API Key 对应的 Keychain 账户名称映射
 */
export const API_KEY_ACCOUNTS = {
  builtin: "builtin-api-key",
  resolve: "resolve-api-token",
  spring: "spring-api-key",
  harness: "harness-api-token",
} as const;

export type ApiKeyType = keyof typeof API_KEY_ACCOUNTS;

/**
 * 保存 API Key 到 Keychain
 * @param type API Key 类型
 * @param apiKey API Key
 * @returns 是否保存成功
 */
export async function saveApiKeyToKeychain(type: ApiKeyType, apiKey: string): Promise<boolean> {
  const account = API_KEY_ACCOUNTS[type];
  return saveToKeychain(account, apiKey);
}

/**
 * 从 Keychain 读取 API Key
 * @param type API Key 类型
 * @returns API Key，如果不存在则返回 null
 */
export async function getApiKeyFromKeychain(type: ApiKeyType): Promise<string | null> {
  const account = API_KEY_ACCOUNTS[type];
  return getFromKeychain(account);
}

/**
 * 从 Keychain 删除 API Key
 * @param type API Key 类型
 * @returns 是否删除成功
 */
export async function deleteApiKeyFromKeychain(type: ApiKeyType): Promise<boolean> {
  const account = API_KEY_ACCOUNTS[type];
  return deleteFromKeychain(account);
}

/**
 * 将所有 API Key 迁移到 Keychain
 * @param settings 设置对象
 * @returns 迁移结果
 */
export async function migrateApiKeysToKeychain(settings: {
  builtin?: { api_key?: string };
  resolve?: { api_token?: string };
  spring?: { api_key?: string };
  harness?: { api_token?: string };
}): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  // 内置 LLM API Key
  if (settings.builtin?.api_key) {
    const ok = await saveApiKeyToKeychain("builtin", settings.builtin.api_key);
    if (ok) success++;
    else failed++;
  }

  // Resolve Studio API Token
  if (settings.resolve?.api_token) {
    const ok = await saveApiKeyToKeychain("resolve", settings.resolve.api_token);
    if (ok) success++;
    else failed++;
  }

  // Spring Harness API Key
  if (settings.spring?.api_key) {
    const ok = await saveApiKeyToKeychain("spring", settings.spring.api_key);
    if (ok) success++;
    else failed++;
  }

  // Resolve Harness API Token
  if (settings.harness?.api_token) {
    const ok = await saveApiKeyToKeychain("harness", settings.harness.api_token);
    if (ok) success++;
    else failed++;
  }

  return { success, failed };
}

/**
 * 从 Keychain 加载所有 API Key
 * @returns 加载的 API Key 对象
 */
export async function loadApiKeysFromKeychain(): Promise<{
  builtinApiKey: string | null;
  resolveApiToken: string | null;
  springApiKey: string | null;
  harnessApiToken: string | null;
}> {
  const [builtinApiKey, resolveApiToken, springApiKey, harnessApiToken] = await Promise.all([
    getApiKeyFromKeychain("builtin"),
    getApiKeyFromKeychain("resolve"),
    getApiKeyFromKeychain("spring"),
    getApiKeyFromKeychain("harness"),
  ]);

  return { builtinApiKey, resolveApiToken, springApiKey, harnessApiToken };
}

// TypeScript 类型辅助
type Option<T> = T | null;

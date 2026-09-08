/**
 * 加密工具函数
 * 使用 Web Crypto API 的 AES-GCM 加密
 *
 * 安全改进：
 * - 加密密钥不再硬编码，首次运行时随机生成并存储在 localStorage
 * - 盐值随机生成，随加密数据一起存储
 * - 使用 PBKDF2 + AES-GCM 256位加密
 *
 * 注意：这是轻量级加密，主要用于避免明文存储。
 * 更高安全需求建议使用系统钥匙串（Keychain）或主密码（Master Password）方案。
 */

const KEY_STORAGE_KEY = "sprite_encryption_secret";
const KEY_LENGTH = 32; // 256位随机密钥

/** 生成随机密钥（hex 字符串） */
function generateRandomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 获取或创建加密密钥（存储在 localStorage） */
function getOrCreateSecret(): string {
  try {
    let secret = localStorage.getItem(KEY_STORAGE_KEY);
    if (!secret) {
      secret = generateRandomKey();
      localStorage.setItem(KEY_STORAGE_KEY, secret);
    }
    return secret;
  } catch (e) {
    // localStorage 不可用时，使用基于时间的临时密钥（不推荐，但保证功能可用）
    console.warn("[sprite] localStorage 不可用，使用临时密钥");
    return `temp-${Date.now()}-${Math.random().toString(36)}`;
  }
}

/** 生成随机盐值 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Uint8Array 转 Base64 */
function bufferToBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf));
}

/** Base64 转 Uint8Array */
function base64ToBuffer(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** 派生加密密钥（PBKDF2 + AES-GCM 256位） */
async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const secret = getOrCreateSecret();
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * 加密文本
 * @returns 加密后的 JSON 字符串（包含 salt、iv 和 data）
 */
export async function encrypt(text: string): Promise<string> {
  const salt = generateSalt();
  const key = await deriveKey(salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text),
  );
  const result = {
    v: 2, // 版本号，用于后续迁移
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    data: bufferToBase64(new Uint8Array(encrypted)),
  };
  return JSON.stringify(result);
}

/**
 * 解密文本
 * @param encryptedJson 加密后的 JSON 字符串
 * @returns 解密后的明文，失败返回空字符串
 */
export async function decrypt(encryptedJson: string): Promise<string> {
  try {
    const parsed = JSON.parse(encryptedJson);

    // 兼容旧版本（v1：固定盐值，只有 iv 和 data）
    let salt: Uint8Array;
    if (parsed.v === 2 && parsed.salt) {
      salt = base64ToBuffer(parsed.salt);
    } else {
      // 旧版本兼容：使用固定盐值
      salt = new TextEncoder().encode("sprite-custom-salt-v1");
    }

    const key = await deriveKey(salt);
    const ivBytes = base64ToBuffer(parsed.iv);
    const dataBytes = base64ToBuffer(parsed.data);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      key,
      dataBytes,
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("[sprite] 解密失败:", e);
    return "";
  }
}

/**
 * 重新加密所有数据（用于密钥迁移或安全升级）
 * 注意：调用方需要提供旧数据列表
 */
export async function reencryptAll(items: Array<{ id: string; content: string }>): Promise<Array<{ id: string; content: string }>> {
  const results: Array<{ id: string; content: string }> = [];
  for (const item of items) {
    const plaintext = await decrypt(item.content);
    if (plaintext) {
      const reencrypted = await encrypt(plaintext);
      results.push({ id: item.id, content: reencrypted });
    } else {
      results.push(item); // 解密失败，保留原数据
    }
  }
  return results;
}

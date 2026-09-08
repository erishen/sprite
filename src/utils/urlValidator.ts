/**
 * URL 验证工具函数
 * 用于验证 LLM 后端 URL 的安全性，防止敏感信息通过明文 HTTP 传输
 */

/** URL 验证结果 */
export interface UrlValidationResult {
  valid: boolean;
  isHttps: boolean;
  isLocalhost: boolean;
  isIp: boolean;
  warning?: string;
  error?: string;
}

/**
 * 验证 URL 的安全性
 * @param url 要验证的 URL
 * @returns 验证结果
 */
export function validateUrl(url: string): UrlValidationResult {
  const result: UrlValidationResult = {
    valid: false,
    isHttps: false,
    isLocalhost: false,
    isIp: false,
  };

  if (!url || !url.trim()) {
    result.error = "URL 不能为空";
    return result;
  }

  try {
    const parsed = new URL(url.trim());

    // 检查协议
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      result.error = "仅支持 HTTP 和 HTTPS 协议";
      return result;
    }

    result.isHttps = parsed.protocol === "https:";

    // 检查是否为 localhost
    const hostname = parsed.hostname.toLowerCase();
    result.isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0";

    // 检查是否为 IP 地址
    result.isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

    // 验证通过
    result.valid = true;

    // 非 localhost 的 HTTP URL 显示警告
    if (!result.isHttps && !result.isLocalhost) {
      result.warning =
        "警告：使用 HTTP 协议可能导致 API Key 和聊天内容通过明文传输，建议使用 HTTPS";
    }

    // 内网 IP 的 HTTP URL 也显示警告（但比公网温和）
    if (!result.isHttps && result.isIp && !result.isLocalhost) {
      const isPrivateIp =
        hostname.startsWith("10.") ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("172.16.") ||
        hostname.startsWith("172.17.") ||
        hostname.startsWith("172.18.") ||
        hostname.startsWith("172.19.") ||
        hostname.startsWith("172.2") ||
        hostname.startsWith("172.30.") ||
        hostname.startsWith("172.31.");

      if (isPrivateIp) {
        result.warning =
          "提示：内网 HTTP 服务可以使用，但如果有条件建议配置 HTTPS";
      }
    }

    return result;
  } catch (e) {
    result.error = "URL 格式不正确，请输入完整的 URL（例如 https://api.example.com/v1）";
    return result;
  }
}

/**
 * 检查 URL 是否为安全的（HTTPS 或 localhost）
 * @param url 要检查的 URL
 * @returns 是否安全
 */
export function isSecureUrl(url: string): boolean {
  const result = validateUrl(url);
  return result.valid && (result.isHttps || result.isLocalhost);
}

/**
 * 获取 URL 的域名（用于显示）
 * @param url URL
 * @returns 域名
 */
export function getDomain(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return parsed.hostname;
  } catch {
    return url;
  }
}

/**
 * 规范化 URL（去除末尾斜杠，统一格式）
 * @param url 原始 URL
 * @returns 规范化后的 URL
 */
export function normalizeUrl(url: string): string {
  if (!url || !url.trim()) return "";
  try {
    const parsed = new URL(url.trim());
    // 去除路径末尾的斜杠（但保留根路径的斜杠）
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return url.trim();
  }
}

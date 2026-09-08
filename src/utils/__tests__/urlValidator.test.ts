/**
 * URL 验证工具函数单元测试
 */

import { describe, it, expect } from "vitest";
import { validateUrl, isSecureUrl, getDomain, normalizeUrl } from "../urlValidator";

describe("urlValidator", () => {
  describe("validateUrl", () => {
    it("应该验证有效的 HTTPS URL", () => {
      const result = validateUrl("https://example.com");
      expect(result.valid).toBe(true);
      expect(result.isHttps).toBe(true);
      expect(result.isLocalhost).toBe(false);
      expect(result.isIp).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("应该验证有效的 HTTP URL", () => {
      const result = validateUrl("http://example.com");
      expect(result.valid).toBe(true);
      expect(result.isHttps).toBe(false);
      expect(result.isLocalhost).toBe(false);
      expect(result.warning).toBeDefined();
    });

    it("应该识别 localhost URL", () => {
      const result = validateUrl("http://localhost:8080");
      expect(result.valid).toBe(true);
      expect(result.isLocalhost).toBe(true);
      expect(result.isHttps).toBe(false);
      expect(result.warning).toBeUndefined();
    });

    it("应该识别 127.0.0.1 URL", () => {
      const result = validateUrl("http://127.0.0.1:3000");
      expect(result.valid).toBe(true);
      expect(result.isLocalhost).toBe(true);
    });

    it("应该识别内网 IP URL (192.168.x.x)", () => {
      const result = validateUrl("http://192.168.1.100:8080");
      expect(result.valid).toBe(true);
      expect(result.isIp).toBe(true);
      expect(result.isLocalhost).toBe(false);
      expect(result.warning).toBeDefined();
    });

    it("应该识别内网 IP URL (10.x.x.x)", () => {
      const result = validateUrl("http://10.0.0.1:8080");
      expect(result.valid).toBe(true);
      expect(result.isIp).toBe(true);
    });

    it("应该识别内网 IP URL (172.16-31.x.x)", () => {
      const result = validateUrl("http://172.16.0.1:8080");
      expect(result.valid).toBe(true);
      expect(result.isIp).toBe(true);
    });

    it("应该拒绝无效的 URL", () => {
      const result = validateUrl("not-a-url");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("应该拒绝空字符串", () => {
      const result = validateUrl("");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("应该处理带路径的 URL", () => {
      const result = validateUrl("https://example.com/path/to/resource?query=value");
      expect(result.valid).toBe(true);
      expect(result.isHttps).toBe(true);
    });

    it("应该拒绝非 HTTP/HTTPS 协议", () => {
      const result = validateUrl("ftp://example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("isSecureUrl", () => {
    it("应该对 HTTPS URL 返回 true", () => {
      expect(isSecureUrl("https://example.com")).toBe(true);
    });

    it("应该对 HTTP URL 返回 false", () => {
      expect(isSecureUrl("http://example.com")).toBe(false);
    });

    it("应该对 localhost 返回 true（本地开发安全）", () => {
      expect(isSecureUrl("http://localhost:3000")).toBe(true);
    });

    it("应该对 127.0.0.1 返回 true", () => {
      expect(isSecureUrl("http://127.0.0.1:3000")).toBe(true);
    });

    it("应该对内网 IP 返回 false（需要 HTTPS）", () => {
      expect(isSecureUrl("http://192.168.1.1:8080")).toBe(false);
    });

    it("应该对无效 URL 返回 false", () => {
      expect(isSecureUrl("not-a-url")).toBe(false);
    });
  });

  describe("getDomain", () => {
    it("应该从 URL 中提取域名", () => {
      expect(getDomain("https://example.com/path")).toBe("example.com");
    });

    it("应该从带端口的 URL 中提取域名", () => {
      expect(getDomain("https://example.com:8080/path")).toBe("example.com");
    });

    it("应该从子域名 URL 中提取完整域名", () => {
      expect(getDomain("https://sub.example.com/path")).toBe("sub.example.com");
    });

    it("应该对无效 URL 返回原始 URL", () => {
      expect(getDomain("not-a-url")).toBe("not-a-url");
    });
  });

  describe("normalizeUrl", () => {
    it("应该规范化 URL（去除非根路径的末尾斜杠）", () => {
      expect(normalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
    });

    it("应该保留根路径的斜杠", () => {
      expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
    });

    it("应该规范化 URL（转换为小写协议和域名）", () => {
      expect(normalizeUrl("HTTPS://EXAMPLE.COM/Path")).toBe("https://example.com/Path");
    });

    it("应该保留路径", () => {
      expect(normalizeUrl("https://example.com/path/to/resource")).toBe(
        "https://example.com/path/to/resource",
      );
    });

    it("应该对无效 URL 返回原始 URL（trim 后）", () => {
      expect(normalizeUrl("not-a-url")).toBe("not-a-url");
    });

    it("应该处理空字符串", () => {
      expect(normalizeUrl("")).toBe("");
    });
  });
});

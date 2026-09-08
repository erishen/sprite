/**
 * 加密工具函数单元测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import { encrypt, decrypt, reencryptAll } from "../crypto";

// 在测试前清除 localStorage
beforeEach(() => {
  localStorage.clear();
});

describe("crypto", () => {
  describe("encrypt", () => {
    it("应该加密文本并返回 JSON 字符串", async () => {
      const plaintext = "这是一个测试密码";
      const encrypted = await encrypt(plaintext);
      expect(typeof encrypted).toBe("string");
      // 应该是有效的 JSON
      const parsed = JSON.parse(encrypted);
      expect(parsed).toBeDefined();
    });

    it("加密结果应该包含版本号、盐值、IV 和数据", async () => {
      const plaintext = "测试密码";
      const encrypted = await encrypt(plaintext);
      const parsed = JSON.parse(encrypted);
      expect(parsed.v).toBe(2);
      expect(parsed.salt).toBeDefined();
      expect(parsed.iv).toBeDefined();
      expect(parsed.data).toBeDefined();
    });

    it("每次加密应该生成不同的结果（随机盐值和 IV）", async () => {
      const plaintext = "相同的密码";
      const encrypted1 = await encrypt(plaintext);
      const encrypted2 = await encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("应该处理空字符串", async () => {
      const encrypted = await encrypt("");
      expect(typeof encrypted).toBe("string");
      const parsed = JSON.parse(encrypted);
      expect(parsed.data).toBeDefined();
    });

    it("应该处理长文本", async () => {
      const longText = "A".repeat(10000);
      const encrypted = await encrypt(longText);
      expect(typeof encrypted).toBe("string");
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(longText);
    });

    it("应该处理特殊字符", async () => {
      const specialText = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
      const encrypted = await encrypt(specialText);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(specialText);
    });

    it("应该处理 Unicode 字符", async () => {
      const unicodeText = "你好世界🌍🎉🚀";
      const encrypted = await encrypt(unicodeText);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(unicodeText);
    });
  });

  describe("decrypt", () => {
    it("应该解密加密后的文本", async () => {
      const plaintext = "这是一个测试密码";
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("应该正确解密多次加密解密", async () => {
      const plaintext = "多次加密测试";
      for (let i = 0; i < 5; i++) {
        const encrypted = await encrypt(plaintext);
        const decrypted = await decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
      }
    });

    it("对无效的 JSON 应该返回空字符串", async () => {
      const decrypted = await decrypt("not-valid-json");
      expect(decrypted).toBe("");
    });

    it("对损坏的数据应该返回空字符串", async () => {
      const encrypted = await encrypt("测试密码");
      const parsed = JSON.parse(encrypted);
      // 损坏数据
      parsed.data = "invalid-base64-data!!!";
      const corrupted = JSON.stringify(parsed);
      const decrypted = await decrypt(corrupted);
      expect(decrypted).toBe("");
    });

    it("应该处理空字符串输入", async () => {
      const decrypted = await decrypt("");
      expect(decrypted).toBe("");
    });
  });

  describe("reencryptAll", () => {
    it("应该重新加密所有项目", async () => {
      const items = [
        { id: "1", content: await encrypt("密码1") },
        { id: "2", content: await encrypt("密码2") },
        { id: "3", content: await encrypt("密码3") },
      ];

      const reencrypted = await reencryptAll(items);
      expect(reencrypted).toHaveLength(3);

      // 验证解密后内容正确
      for (let i = 0; i < reencrypted.length; i++) {
        const decrypted = await decrypt(reencrypted[i].content);
        expect(decrypted).toBe(`密码${i + 1}`);
      }
    });

    it("应该保留 ID", async () => {
      const items = [
        { id: "item-1", content: await encrypt("测试") },
        { id: "item-2", content: await encrypt("测试") },
      ];

      const reencrypted = await reencryptAll(items);
      expect(reencrypted[0].id).toBe("item-1");
      expect(reencrypted[1].id).toBe("item-2");
    });

    it("对解密失败的项目应该保留原数据", async () => {
      const items = [
        { id: "valid", content: await encrypt("有效密码") },
        { id: "invalid", content: "invalid-encrypted-data" },
      ];

      const reencrypted = await reencryptAll(items);
      expect(reencrypted).toHaveLength(2);
      // 无效项目应该保留原数据
      expect(reencrypted[1].content).toBe("invalid-encrypted-data");
    });

    it("应该处理空列表", async () => {
      const reencrypted = await reencryptAll([]);
      expect(reencrypted).toHaveLength(0);
    });
  });
});

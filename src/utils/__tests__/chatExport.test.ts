/**
 * 聊天记录导出工具函数单元测试
 */

import { describe, it, expect } from "vitest";
import { messagesToMarkdown, messagesToJson, type ChatMessage } from "../chatExport";

// 测试用的聊天消息
const testMessages: ChatMessage[] = [
  {
    role: "user",
    content: "你好，请帮我写一个 Rust 程序",
    timestamp: Date.now() - 60000,
  },
  {
    role: "assistant",
    content: "好的，这是一个简单的 Rust 程序：\n\n```rust\nfn main() {\n    println!(\"Hello, World!\");\n}\n```",
    timestamp: Date.now() - 50000,
  },
  {
    role: "tool",
    content: "文件创建成功",
    timestamp: Date.now() - 40000,
    toolName: "create_file",
    toolArgs: { path: "/tmp/test.rs", content: "fn main() {}" },
  },
  {
    role: "system",
    content: "系统提示：会话已开始",
    timestamp: Date.now() - 70000,
  },
];

describe("chatExport", () => {
  describe("messagesToMarkdown", () => {
    it("应该将聊天记录转换为 Markdown 格式", () => {
      const markdown = messagesToMarkdown(testMessages, "测试聊天记录");
      expect(markdown).toContain("# 测试聊天记录");
      expect(markdown).toContain("消息数量：4");
      expect(markdown).toContain("👤 用户");
      expect(markdown).toContain("🤖 助手");
      expect(markdown).toContain("🔧 工具");
      expect(markdown).toContain("⚙️ 系统");
    });

    it("应该包含用户消息内容", () => {
      const markdown = messagesToMarkdown(testMessages);
      expect(markdown).toContain("你好，请帮我写一个 Rust 程序");
    });

    it("应该包含助手消息内容和代码块", () => {
      const markdown = messagesToMarkdown(testMessages);
      expect(markdown).toContain("好的，这是一个简单的 Rust 程序");
      expect(markdown).toContain("```rust");
      expect(markdown).toContain("fn main()");
    });

    it("应该包含工具调用信息", () => {
      const markdown = messagesToMarkdown(testMessages);
      expect(markdown).toContain("**工具调用：create_file**");
      expect(markdown).toContain("```json");
      expect(markdown).toContain("/tmp/test.rs");
    });

    it("应该处理空消息列表", () => {
      const markdown = messagesToMarkdown([], "空聊天记录");
      expect(markdown).toContain("# 空聊天记录");
      expect(markdown).toContain("消息数量：0");
    });

    it("应该使用默认标题", () => {
      const markdown = messagesToMarkdown(testMessages);
      expect(markdown).toContain("# 聊天记录");
    });

    it("应该包含导出时间", () => {
      const markdown = messagesToMarkdown(testMessages);
      expect(markdown).toContain("导出时间：");
    });

    it("应该包含消息时间戳", () => {
      const markdown = messagesToMarkdown(testMessages);
      // 时间戳格式应该包含时间
      expect(markdown).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("messagesToJson", () => {
    it("应该将聊天记录转换为 JSON 格式", () => {
      const json = messagesToJson(testMessages, "测试聊天记录");
      const data = JSON.parse(json);
      expect(data.title).toBe("测试聊天记录");
      expect(data.messageCount).toBe(4);
      expect(data.messages).toHaveLength(4);
      expect(data.exportedAt).toBeDefined();
    });

    it("应该包含正确的消息角色", () => {
      const json = messagesToJson(testMessages);
      const data = JSON.parse(json);
      expect(data.messages[0].role).toBe("user");
      expect(data.messages[1].role).toBe("assistant");
      expect(data.messages[2].role).toBe("tool");
      expect(data.messages[3].role).toBe("system");
    });

    it("应该包含消息内容", () => {
      const json = messagesToJson(testMessages);
      const data = JSON.parse(json);
      expect(data.messages[0].content).toBe("你好，请帮我写一个 Rust 程序");
    });

    it("应该包含工具调用信息", () => {
      const json = messagesToJson(testMessages);
      const data = JSON.parse(json);
      expect(data.messages[2].toolName).toBe("create_file");
      expect(data.messages[2].toolArgs).toBeDefined();
      expect(data.messages[2].toolArgs.path).toBe("/tmp/test.rs");
    });

    it("应该处理空消息列表", () => {
      const json = messagesToJson([], "空聊天记录");
      const data = JSON.parse(json);
      expect(data.messageCount).toBe(0);
      expect(data.messages).toHaveLength(0);
    });

    it("应该使用默认标题", () => {
      const json = messagesToJson(testMessages);
      const data = JSON.parse(json);
      expect(data.title).toBe("聊天记录");
    });

    it("应该包含 ISO 格式的时间戳", () => {
      const json = messagesToJson(testMessages);
      const data = JSON.parse(json);
      expect(data.exportedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(data.messages[0].timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("应该生成有效的 JSON", () => {
      const json = messagesToJson(testMessages);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });
});

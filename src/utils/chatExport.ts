/**
 * 聊天记录导出工具函数
 * 支持导出为 Markdown 和 JSON 格式
 */

import { invoke } from "@tauri-apps/api/core";
import { toast } from "../hooks/useToast";

/** 聊天消息类型 */
export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp?: number;
  toolName?: string;
  toolArgs?: unknown;
}

/** 导出格式 */
export type ExportFormat = "markdown" | "json";

/**
 * 将聊天记录转换为 Markdown 格式
 * @param messages 聊天消息列表
 * @param title 导出标题
 * @returns Markdown 字符串
 */
export function messagesToMarkdown(messages: ChatMessage[], title: string = "聊天记录"): string {
  const lines: string[] = [];

  // 标题
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> 导出时间：${new Date().toLocaleString("zh-CN")}`);
  lines.push(`> 消息数量：${messages.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 消息内容
  for (const msg of messages) {
    const roleLabel = getRoleLabel(msg.role);
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString("zh-CN") : "";

    lines.push(`## ${roleLabel}${time ? ` (${time})` : ""}`);
    lines.push("");

    if (msg.role === "tool" && msg.toolName) {
      lines.push(`**工具调用：${msg.toolName}**`);
      lines.push("");
      if (msg.toolArgs) {
        lines.push("```json");
        lines.push(JSON.stringify(msg.toolArgs, null, 2));
        lines.push("```");
        lines.push("");
      }
    }

    // 处理代码块，确保 Markdown 格式正确
    const content = msg.content || "";
    lines.push(content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * 将聊天记录转换为 JSON 格式
 * @param messages 聊天消息列表
 * @param title 导出标题
 * @returns JSON 字符串
 */
export function messagesToJson(messages: ChatMessage[], title: string = "聊天记录"): string {
  const data = {
    title,
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : undefined,
      toolName: msg.toolName,
      toolArgs: msg.toolArgs,
    })),
  };
  return JSON.stringify(data, null, 2);
}

/**
 * 导出聊天记录到文件
 * 使用 Tauri Rust 后端保存到下载目录，兼容桌面应用环境
 * @param messages 聊天消息列表
 * @param format 导出格式（markdown 或 json）
 * @param title 导出标题
 * @returns 是否成功
 */
export async function exportChatMessages(
  messages: ChatMessage[],
  format: ExportFormat = "markdown",
  title: string = "聊天记录",
): Promise<boolean> {
  try {
    let content: string;
    let extension: string;

    if (format === "markdown") {
      content = messagesToMarkdown(messages, title);
      extension = "md";
    } else {
      content = messagesToJson(messages, title);
      extension = "json";
    }

    // 生成文件名
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, "-");
    const fileName = `chat-export-${dateStr}-${timeStr}.${extension}`;

    // 使用 Tauri Rust 后端保存到下载目录
    const savedPath = await invoke<string>("save_export_file", {
      fileName,
      content,
    });

    console.log(`[sprite] 聊天记录导出成功：${savedPath}（${messages.length} 条消息）`);
    toast.success(`聊天记录已导出到下载目录（${messages.length} 条消息）`);
    return true;
  } catch (e) {
    console.error("[sprite] 聊天记录导出失败：", e);
    toast.error("聊天记录导出失败，请查看控制台日志");
    return false;
  }
}

/**
 * 获取角色的中文标签
 * @param role 角色
 * @returns 中文标签
 */
function getRoleLabel(role: string): string {
  switch (role) {
    case "user":
      return "👤 用户";
    case "assistant":
      return "🤖 助手";
    case "system":
      return "⚙️ 系统";
    case "tool":
      return "🔧 工具";
    default:
      return role;
  }
}

/**
 * 复制聊天记录到剪贴板
 * @param messages 聊天消息列表
 * @param format 导出格式
 * @param title 导出标题
 * @returns 是否成功
 */
export async function copyChatMessages(
  messages: ChatMessage[],
  format: ExportFormat = "markdown",
  title: string = "聊天记录",
): Promise<boolean> {
  try {
    const content =
      format === "markdown" ? messagesToMarkdown(messages, title) : messagesToJson(messages, title);

    await navigator.clipboard.writeText(content);
    console.log(`[sprite] 聊天记录已复制到剪贴板（${messages.length} 条消息）`);
    return true;
  } catch (e) {
    console.error("[sprite] 聊天记录复制失败：", e);
    return false;
  }
}

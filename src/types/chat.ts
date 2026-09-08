/**
 * 聊天面板通用类型定义
 *
 * 包含对话轮次、工具调用日志、工具状态等通用类型，
 * 以及 Resolve Studio 特有的事件和健康检查类型。
 */

/** 与 Rust `ResolveEvent`（serde tag=type, camelCase）一一对应。 */
export type ResolveEvent =
  | { type: "step"; step: unknown }
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "toolCall"; call: { id?: string; name?: string; arguments?: unknown } }
  | {
      type: "toolResult";
      payload: { call?: { id?: string }; result?: unknown; ok?: boolean; durationMs?: number };
    }
  | { type: "toolProgress"; payload: { id?: string; chunk?: string } }
  | { type: "approvalRequest"; call: { id?: string; name?: string } }
  | { type: "usage"; record: unknown }
  | { type: "done"; answer: unknown }
  | { type: "error"; message: string };

/** Resolve Studio 健康检查结果 */
export interface Health {
  ok: boolean;
  tools: number;
  mcp_servers: number;
  uptime_secs: number;
  error: string | null;
}

/** 工具调用状态 */
export type ToolState = "running" | "ok" | "fail" | "rejected";

/** 工具调用日志 */
export interface ToolLog {
  id: string;
  name: string;
  state: ToolState;
  /** 格式化后的参数 JSON（tool-call.arguments）。 */
  args?: string;
  /** 重试时用的原始参数对象。 */
  argsObj?: Record<string, unknown>;
  durationMs?: number;
  /** tool-progress 累积的流式日志。 */
  progress?: string;
  /** 等待人工审批（卡内渲染批准/拒绝按钮）。 */
  awaitingApproval?: boolean;
  /** 工具结果 / 失败错误文本（未截断，展示时折叠）。 */
  result?: string;
}

/** 对话轮次 */
export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  reasoning: string;
  tools: ToolLog[];
  done: boolean;
}

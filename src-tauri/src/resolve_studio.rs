//! resolve-studio 后端桥接（8787）：health / chat / tool-run / approval / file。
//! SSE 事件词汇与 resolve-studio web-server 对应，公共 StreamEvent trait 在 resolve.rs。

use serde::Serialize;
use std::time::Duration;
use tauri::ipc::Channel;

use crate::resolve::{base_or, spawn_task, split_frame, StreamEvent, DEFAULT_RESOLVE_BASE};

/// 转发给前端的 resolve SSE 事件。
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ResolveEvent {
    Step { step: serde_json::Value },
    Delta { text: String },
    Reasoning { text: String },
    ToolCall { call: serde_json::Value },
    ToolResult { payload: serde_json::Value },
    ToolProgress { payload: serde_json::Value },
    ApprovalRequest { call: serde_json::Value },
    Usage { record: serde_json::Value },
    Done { answer: serde_json::Value },
    Error { message: String },
}

impl StreamEvent for ResolveEvent {
    fn error_event(message: String) -> Self {
        ResolveEvent::Error { message }
    }
    fn parse(frame: &str) -> Option<Self> {
        let (event, data) = split_frame(frame);
        if data.is_empty() {
            return None;
        }
        let json: serde_json::Value = serde_json::from_str(&data).ok()?;
        match event.as_str() {
            "step" => Some(ResolveEvent::Step { step: json }),
            "delta" => Some(ResolveEvent::Delta {
                text: json.get("text").and_then(|t| t.as_str()).unwrap_or("").to_string(),
            }),
            "reasoning" => Some(ResolveEvent::Reasoning {
                text: json.get("text").and_then(|t| t.as_str()).unwrap_or("").to_string(),
            }),
            "tool-call" => json.get("call").map(|c| ResolveEvent::ToolCall { call: c.clone() }),
            "tool-result" => json.get("payload").map(|p| ResolveEvent::ToolResult { payload: p.clone() }),
            "tool-progress" => json.get("payload").map(|p| ResolveEvent::ToolProgress { payload: p.clone() }),
            "approval-request" => json.get("call").map(|c| ResolveEvent::ApprovalRequest { call: c.clone() }),
            "usage" => Some(ResolveEvent::Usage { record: json }),
            "done" => Some(ResolveEvent::Done { answer: json }),
            "error" => Some(ResolveEvent::Error {
                message: json.get("message").and_then(|m| m.as_str()).unwrap_or("未知错误").to_string(),
            }),
            _ => None,
        }
    }
}

/// resolve-studio 服务是否在跑（HUD 状态点用）。
#[derive(Serialize)]
pub struct ResolveHealth {
    pub ok: bool,
    pub tools: u64,
    pub mcp_servers: u64,
    pub uptime_secs: f64,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn resolve_health(base: String) -> ResolveHealth {
    let base = base_or(&base, DEFAULT_RESOLVE_BASE);
    match reqwest::Client::new()
        .get(format!("{base}/health"))
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => match resp.json::<serde_json::Value>().await {
            Ok(v) => ResolveHealth {
                ok: v.get("status").and_then(|s| s.as_str()) == Some("ok"),
                tools: v.get("tools").and_then(|t| t.as_u64()).unwrap_or(0),
                mcp_servers: v.get("mcpServers").and_then(|m| m.as_u64()).unwrap_or(0),
                uptime_secs: v.get("uptime").and_then(|u| u.as_f64()).unwrap_or(0.0),
                error: None,
            },
            Err(e) => ResolveHealth {
                ok: false,
                tools: 0,
                mcp_servers: 0,
                uptime_secs: 0.0,
                error: Some(format!("解析 /health 响应失败: {e}")),
            },
        },
        Ok(_) => ResolveHealth {
            ok: false,
            tools: 0,
            mcp_servers: 0,
            uptime_secs: 0.0,
            error: Some("resolve-studio 返回非成功状态".into()),
        },
        Err(e) => ResolveHealth {
            ok: false,
            tools: 0,
            mcp_servers: 0,
            uptime_secs: 0.0,
            error: Some(format!("无法连接 resolve-studio（{base}）: {e}")),
        },
    }
}

/// 中断指定窗口正在跑的请求（"停止"按钮调用）。
#[tauri::command]
pub async fn resolve_chat_abort(win: String) {
    crate::resolve::abort_task(&win);
}

/// 对 pending 的工具调用做出审批决定（HUD 内的批准/拒绝按钮）。
#[tauri::command]
pub async fn resolve_approve(base: String, call_id: String, decision: String) -> Result<(), String> {
    if decision != "approve" && decision != "reject" {
        return Err("decision 必须是 approve 或 reject".into());
    }
    let base = base_or(&base, DEFAULT_RESOLVE_BASE);
    let resp = reqwest::Client::new()
        .post(format!("{base}/api/approval"))
        .json(&serde_json::json!({ "callId": call_id, "decision": decision }))
        .send()
        .await
        .map_err(|e| format!("请求审批接口失败: {e}"))?;
    let status = resp.status();
    if status.is_success() {
        Ok(())
    } else {
        let text = resp.text().await.unwrap_or_default();
        Err(format!("审批失败 ({status})：{text}"))
    }
}

/// 读取一个文件用于预览（走后端 /api/file，受其 fsRoots 沙箱约束）。
#[tauri::command]
pub async fn resolve_file(base: String, path: String) -> Result<serde_json::Value, String> {
    let base = base_or(&base, DEFAULT_RESOLVE_BASE);
    let url = format!("{base}/api/file?path={}", crate::resolve::urlencode(&path));
    let resp = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求文件接口失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if status.is_success() {
        serde_json::from_str(&text).map_err(|e| format!("解析文件响应失败: {e}"))
    } else {
        Err(format!("读取文件失败 ({status})：{text}"))
    }
}

/// 调 resolve-studio `/api/chat`（OpenAI 兼容 messages）。SSE 事件经 Channel 推前端。
#[tauri::command]
pub async fn resolve_chat(
    win: String,
    base: String,
    messages: Vec<serde_json::Value>,
    on_event: Channel<ResolveEvent>,
) -> Result<(), String> {
    if messages.is_empty() {
        return Err("消息不能为空".into());
    }
    let base = base_or(&base, DEFAULT_RESOLVE_BASE);
    let body = serde_json::json!({ "messages": messages });
    spawn_task(win, on_event, move || {
        let client = reqwest::Client::new();
        let body = body.clone();
        async move {
            client
                .post(format!("{base}/api/chat"))
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("请求 resolve-studio 失败: {e}"))
        }
    })
}

/// 直接运行单个工具（不走 LLM 规划），用于工具卡上的"重试"。
#[tauri::command]
pub async fn resolve_tool_run(
    win: String,
    base: String,
    name: String,
    arguments: serde_json::Value,
    on_event: Channel<ResolveEvent>,
) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("工具名不能为空".into());
    }
    let base = base_or(&base, DEFAULT_RESOLVE_BASE);
    let body = serde_json::json!({ "name": name, "arguments": arguments });
    spawn_task(win, on_event, move || {
        let client = reqwest::Client::new();
        let body = body.clone();
        async move {
            client
                .post(format!("{base}/api/tool/run"))
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("请求工具运行失败: {e}"))
        }
    })
}

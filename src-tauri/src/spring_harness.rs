//! spring-harness 后端桥接（8080）：ReAct Agent SSE / info / models。

use serde::Serialize;
use std::time::Duration;
use tauri::ipc::Channel;

use crate::resolve::{base_or, spawn_task, split_frame, urlencode, StreamEvent, DEFAULT_SPRING_BASE};

/// 转发给前端的 spring-harness SSE 事件（ReAct Agent 流式协议）。
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SpringEvent {
    Thinking { text: String },
    Tool { call: serde_json::Value },
    Delta { text: String },
    Done,
    Error { message: String },
}

impl StreamEvent for SpringEvent {
    fn error_event(message: String) -> Self {
        SpringEvent::Error { message }
    }
    /// spring ReAct SSE：帧内只有 `data: <json>`，json 带 `type` 字段。
    fn parse(frame: &str) -> Option<Self> {
        let (_event, data) = split_frame(frame);
        if data.is_empty() {
            return None;
        }
        let json: serde_json::Value = serde_json::from_str(&data).ok()?;
        let ty = json.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match ty {
            "thinking" => {
                let step = json.get("step").and_then(|s| s.as_str()).unwrap_or("");
                let content = json.get("content").and_then(|c| c.as_str()).unwrap_or("");
                let text = if !step.is_empty() { step } else { content };
                if text.is_empty() {
                    None
                } else {
                    Some(SpringEvent::Thinking { text: text.to_string() })
                }
            }
            "tool" => {
                let raw = json.get("toolCall").and_then(|t| t.as_str()).unwrap_or("");
                if raw.is_empty() {
                    None
                } else {
                    let call = serde_json::from_str::<serde_json::Value>(raw)
                        .unwrap_or(serde_json::Value::String(raw.to_string()));
                    Some(SpringEvent::Tool { call })
                }
            }
            "answer" => {
                let content = json.get("content").and_then(|c| c.as_str()).unwrap_or("");
                if content.is_empty() {
                    None
                } else {
                    Some(SpringEvent::Delta { text: content.to_string() })
                }
            }
            "done" => Some(SpringEvent::Done),
            "error" => Some(SpringEvent::Error {
                message: json
                    .get("content")
                    .and_then(|c| c.as_str())
                    .unwrap_or("spring-harness 未知错误")
                    .to_string(),
            }),
            _ => None,
        }
    }
}

/// 调 spring-harness ReAct Agent SSE（`GET /chat/agent/react/stream`）。
#[tauri::command]
pub async fn spring_chat(
    win: String,
    base: String,
    message: String,
    model: String,
    on_event: Channel<SpringEvent>,
) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("消息不能为空".into());
    }
    let base = base_or(&base, DEFAULT_SPRING_BASE);
    let url = format!(
        "{base}/chat/agent/react/stream?message={}&model={}",
        urlencode(&message),
        urlencode(&model)
    );
    spawn_task(win, on_event, move || {
        let client = reqwest::Client::new();
        async move {
            client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("请求 spring-harness 失败: {e}"))
        }
    })
}

/// 拉取 spring-harness 运行状态（`GET /info`：工具/MCP/Knowledge/模型计数）。
#[tauri::command]
pub async fn spring_info(base: String) -> Result<serde_json::Value, String> {
    let base = base_or(&base, DEFAULT_SPRING_BASE);
    let resp = reqwest::Client::new()
        .get(format!("{base}/info"))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("请求 spring 状态失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if status.is_success() {
        serde_json::from_str(&text).map_err(|e| format!("解析 spring 状态失败: {e}"))
    } else {
        Err(format!("spring 状态接口失败 ({status})：{text}"))
    }
}

/// 拉取 spring-harness 可用模型列表（`GET /models`，enabled 项）。
#[tauri::command]
pub async fn spring_models(base: String) -> Result<Vec<serde_json::Value>, String> {
    let base = base_or(&base, DEFAULT_SPRING_BASE);
    let resp = reqwest::Client::new()
        .get(format!("{base}/models"))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("请求模型列表失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if status.is_success() {
        serde_json::from_str(&text).map_err(|e| format!("解析模型列表失败: {e}"))
    } else {
        Err(format!("模型列表接口失败 ({status})：{text}"))
    }
}

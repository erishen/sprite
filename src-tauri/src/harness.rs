//! resolve-harness 后端桥接（8899）：同步 chat / health / models / examples。
//! 无 SSE：Rust 侧解析 JSON 后按 trace → reply 顺序推送，前端复用同一套消息流。

use serde::Serialize;
use std::time::Duration;
use tauri::ipc::Channel;

use crate::resolve::{abort_task, base_or, register_task, StreamEvent, DEFAULT_HARNESS_BASE};

/// 转发给前端的 resolve-harness 事件。
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HarnessEvent {
    Tool {
        call: serde_json::Value,
    },
    ToolResult {
        call: serde_json::Value,
    },
    Text {
        text: String,
    },
    /// 工具调用等待人工审批（前端渲染批准/拒绝按钮）。
    ApprovalRequest {
        #[serde(rename = "threadId")]
        thread_id: String,
        #[serde(rename = "callId")]
        call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
    },
    Done,
    Error {
        message: String,
    },
}

impl StreamEvent for HarnessEvent {
    fn error_event(message: String) -> Self {
        HarnessEvent::Error { message }
    }
    /// resolve-harness 不走 SSE，帧解析无意义。
    fn parse(_frame: &str) -> Option<Self> {
        None
    }
}

/// resolve-harness 健康状态（GET /api/health，免 token）。
#[derive(Serialize)]
pub struct HarnessHealth {
    pub ok: bool,
    pub model: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn harness_health(base: String) -> HarnessHealth {
    let base = base_or(&base, DEFAULT_HARNESS_BASE);
    match reqwest::Client::new()
        .get(format!("{base}/api/health"))
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => match resp.json::<serde_json::Value>().await {
            Ok(v) => HarnessHealth {
                ok: v.get("status").and_then(|s| s.as_str()) == Some("ok"),
                model: v
                    .get("model")
                    .and_then(|m| m.as_str())
                    .unwrap_or("")
                    .to_string(),
                error: None,
            },
            Err(e) => HarnessHealth {
                ok: false,
                model: String::new(),
                error: Some(format!("解析 /api/health 响应失败: {e}")),
            },
        },
        Ok(_) => HarnessHealth {
            ok: false,
            model: String::new(),
            error: Some("resolve-harness 返回非成功状态".into()),
        },
        Err(e) => HarnessHealth {
            ok: false,
            model: String::new(),
            error: Some(format!("无法连接 resolve-harness（{base}）: {e}")),
        },
    }
}

/// 调 resolve-harness `/api/chat`（同步 JSON：reply + trace 工具过程）。
#[tauri::command]
pub async fn harness_chat(
    win: String,
    base: String,
    token: String,
    message: String,
    model: String,
    on_event: Channel<HarnessEvent>,
) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("消息不能为空".into());
    }
    let base = base_or(&base, DEFAULT_HARNESS_BASE);
    let body = serde_json::json!({ "message": message, "model": model });
    abort_task(&win);
    let handle = tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        let mut req = client.post(format!("{base}/api/chat")).json(&body);
        if !token.trim().is_empty() {
            req = req.bearer_auth(token.trim());
        }
        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                let _ = on_event.send(HarnessEvent::Error {
                    message: format!("请求 resolve-harness 失败: {e}"),
                });
                return;
            }
        };
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            let _ = on_event.send(HarnessEvent::Error {
                message: format!("resolve-harness 返回 {status}: {text}"),
            });
            return;
        }
        let json: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                let _ = on_event.send(HarnessEvent::Error {
                    message: format!("解析 resolve-harness 响应失败: {e}"),
                });
                return;
            }
        };
        if json.get("status").and_then(|s| s.as_str()) == Some("pending_approval") {
            let thread_id = json
                .get("thread_id")
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            // 从 pending 列表中提取每个待审批的工具调用
            if let Some(pending) = json.get("pending").and_then(|p| p.as_array()) {
                for call in pending.iter() {
                    let call_id = call
                        .get("id")
                        .and_then(|i| i.as_str())
                        .or_else(|| call.get("call_id").and_then(|i| i.as_str()))
                        .or_else(|| call.get("callId").and_then(|i| i.as_str()))
                        .unwrap_or("")
                        .to_string();
                    let tool_name = call
                        .get("name")
                        .and_then(|n| n.as_str())
                        .or_else(|| call.get("tool_name").and_then(|n| n.as_str()))
                        .or_else(|| call.get("toolName").and_then(|n| n.as_str()))
                        .unwrap_or("tool")
                        .to_string();
                    let _ = on_event.send(HarnessEvent::ApprovalRequest {
                        thread_id: thread_id.clone(),
                        call_id,
                        tool_name,
                    });
                }
            }
            return;
        }
        if let Some(trace) = json.get("trace").and_then(|t| t.as_array()) {
            for item in trace {
                let kind = item.get("kind").and_then(|k| k.as_str()).unwrap_or("");
                match kind {
                    "tool_call" => {
                        if on_event
                            .send(HarnessEvent::Tool { call: item.clone() })
                            .is_err()
                        {
                            return;
                        }
                    }
                    "tool_result"
                        if on_event
                            .send(HarnessEvent::ToolResult { call: item.clone() })
                            .is_err() =>
                    {
                        return;
                    }
                    _ => {}
                }
            }
        }
        if let Some(reply) = json.get("reply").and_then(|r| r.as_str()) {
            if !reply.trim().is_empty()
                && on_event
                    .send(HarnessEvent::Text {
                        text: reply.to_string(),
                    })
                    .is_err()
            {
                return;
            }
        }
        let _ = on_event.send(HarnessEvent::Done);
    });
    register_task(&win, handle);
    Ok(())
}

/// 拉取 resolve-harness 可用模型（GET /api/config 需 token）。
#[tauri::command]
pub async fn harness_models(base: String, token: String) -> Result<Vec<serde_json::Value>, String> {
    let base = base_or(&base, DEFAULT_HARNESS_BASE);
    let mut req = reqwest::Client::new()
        .get(format!("{base}/api/config"))
        .timeout(Duration::from_secs(5));
    if !token.trim().is_empty() {
        req = req.bearer_auth(token.trim());
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("请求 resolve-harness 模型列表失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("模型列表接口失败 ({status})：{text}"));
    }
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("解析模型列表失败: {e}"))?;
    let mut out: Vec<serde_json::Value> = Vec::new();
    if let Some(env) = json.get("env_model") {
        if let Some(m) = env.get("model").and_then(|m| m.as_str()) {
            if !m.is_empty() {
                out.push(serde_json::json!({
                    "id": m,
                    "model": m,
                    "baseUrl": env.get("base_url").and_then(|b| b.as_str()).unwrap_or(""),
                }));
            }
        }
    }
    if let Some(models) = json.get("models").and_then(|m| m.as_object()) {
        for (alias, spec) in models {
            out.push(serde_json::json!({
                "id": alias,
                "model": spec.get("model").and_then(|m| m.as_str()).unwrap_or(""),
                "baseUrl": spec.get("base_url").and_then(|b| b.as_str()).unwrap_or(""),
            }));
        }
    }
    Ok(out)
}

/// 拉取示例问题（GET /api/examples，需 token）：返回 [{label, text}]。
#[tauri::command]
pub async fn fetch_examples(
    base: String,
    token: String,
    mode: Option<String>,
    llm: Option<bool>,
) -> Result<Vec<serde_json::Value>, String> {
    let base = base_or(&base, DEFAULT_HARNESS_BASE);
    let mut url = format!("{base}/api/examples");
    if let Some(m) = mode.as_deref().filter(|m| !m.is_empty()) {
        url.push_str(&format!("?mode={m}"));
    }
    if llm.unwrap_or(false) {
        url.push_str(if url.contains('?') {
            "&llm=true"
        } else {
            "?llm=true"
        });
    }
    let mut req = reqwest::Client::new()
        .get(url)
        .timeout(Duration::from_secs(5));
    if !token.trim().is_empty() {
        req = req.bearer_auth(token.trim());
    }
    let resp = req.send().await.map_err(|e| format!("请求示例失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("示例接口失败 ({status})：{text}"));
    }
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("解析示例失败: {e}"))?;
    Ok(json
        .get("examples")
        .and_then(|e| e.as_array())
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|e| {
            let text = e
                .get("text")
                .and_then(|t| t.as_str())
                .or_else(|| e.get("title").and_then(|t| t.as_str()))?;
            if text.trim().is_empty() {
                return None;
            }
            let label = e
                .get("label")
                .and_then(|l| l.as_str())
                .or_else(|| e.get("title").and_then(|t| t.as_str()))
                .unwrap_or("");
            Some(serde_json::json!({ "label": label, "text": text }))
        })
        .collect())
}

/// 对 pending 的工具调用做出审批决定（HUD 内的批准/拒绝按钮）。
/// 调用 POST /api/chat/approve，审批后的响应结构和 /api/chat 相同，通过 on_event 转发给前端。
#[tauri::command]
pub async fn harness_approve(
    base: String,
    token: String,
    thread_id: String,
    call_id: String,
    decision: String,
    on_event: Channel<HarnessEvent>,
) -> Result<(), String> {
    if decision != "approve" && decision != "deny" {
        return Err("decision 必须是 approve 或 deny".into());
    }
    if thread_id.is_empty() {
        return Err("thread_id 不能为空".into());
    }
    let base = base_or(&base, DEFAULT_HARNESS_BASE);
    let action = if decision == "approve" {
        "approve"
    } else {
        "deny"
    };
    let mut req = reqwest::Client::new()
        .post(format!("{base}/api/chat/approve"))
        .json(&serde_json::json!({
            "thread_id": thread_id,
            "decisions": [{"id": call_id, "action": action}]
        }))
        .timeout(Duration::from_secs(120));
    if !token.trim().is_empty() {
        req = req.bearer_auth(token.trim());
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("请求审批接口失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("审批失败 ({status})：{text}"));
    }
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("解析审批响应失败: {e}"))?;

    // 1. 如果又是 pending_approval，继续发送 ApprovalRequest 事件（链式审批）
    if json.get("status").and_then(|s| s.as_str()) == Some("pending_approval") {
        let new_thread_id = json
            .get("thread_id")
            .and_then(|t| t.as_str())
            .unwrap_or(&thread_id)
            .to_string();
        if let Some(pending) = json.get("pending").and_then(|p| p.as_array()) {
            for call in pending {
                let cid = call
                    .get("id")
                    .and_then(|i| i.as_str())
                    .unwrap_or("")
                    .to_string();
                let tname = call
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("tool")
                    .to_string();
                let _ = on_event.send(HarnessEvent::ApprovalRequest {
                    thread_id: new_thread_id.clone(),
                    call_id: cid,
                    tool_name: tname,
                });
            }
        }
        return Ok(());
    }

    // 2. 处理 trace（工具调用和结果）
    if let Some(trace) = json.get("trace").and_then(|t| t.as_array()) {
        for item in trace.iter() {
            let kind = item.get("kind").and_then(|k| k.as_str()).unwrap_or("");
            match kind {
                "tool_call" => {
                    if on_event
                        .send(HarnessEvent::Tool { call: item.clone() })
                        .is_err()
                    {
                        return Ok(());
                    }
                }
                "tool_result"
                    if on_event
                        .send(HarnessEvent::ToolResult { call: item.clone() })
                        .is_err() =>
                {
                    return Ok(());
                }
                _ => {}
            }
        }
    }

    // 3. 处理 reply（回复文本）
    if let Some(reply) = json.get("reply").and_then(|r| r.as_str()) {
        if !reply.trim().is_empty()
            && on_event
                .send(HarnessEvent::Text {
                    text: reply.to_string(),
                })
                .is_err()
        {
            return Ok(());
        }
    }

    // 4. 发送 Done 事件
    let _ = on_event.send(HarnessEvent::Done);
    Ok(())
}

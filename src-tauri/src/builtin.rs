//! 内置 LLM 客户端：直接调用 OpenAI 兼容 API（DeepSeek / OpenAI / 通义等），
//! 作为三个后端都不可用时的 fallback。SSE 流式返回，复用 resolve.rs 的公共工具。

use crate::resolve::{base_or, split_frame, spawn_task, StreamEvent};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

/// 内置 LLM 默认地址（DeepSeek）。
const DEFAULT_LLM_BASE: &str = "https://api.deepseek.com";

/// 内置 LLM 系统提示词：告诉模型角色定位和回答格式要求（参考 resolve-studio 的做法）。
const BUILTIN_SYSTEM_PROMPT: &str = r#"你是 Sprite 桌面助手，运行在用户的 macOS 电脑上。

回答要求：
1. 用规范的 Markdown 格式回答，列表优先于表格
2. 代码块用 ``` 包裹，注明语言
3. 回答简洁明了，直接给出答案，不要废话
4. 如果用户问的是操作系统或应用程序相关的问题，给出具体的操作步骤和快捷键
5. 不要输出 "can I help you" 之类的开场白，直接回答问题
6. 如果不确定，直接说不知道，不要编造"#;

/// 历史消息（前端传递的对话历史，用于多轮对话上下文）。
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HistoryMessage {
    pub role: String,
    pub content: String,
}

/// 内置 LLM 事件（与前端 BuiltinPanel 一一对应）。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BuiltinEvent {
    Delta { text: String },
    Error { message: String },
    Done,
}

impl StreamEvent for BuiltinEvent {
    fn error_event(message: String) -> Self {
        BuiltinEvent::Error { message }
    }

    /// 解析 OpenAI 兼容 SSE 帧：`data: {json}`，提取 `choices[0].delta.content`。
    /// `data: [DONE]` 表示流结束，返回 Done 事件（前端据此显示 follow-up 示例问题）。
    fn parse(frame: &str) -> Option<Self> {
        let (_event, data) = split_frame(frame);
        if data.is_empty() {
            return None;
        }
        if data == "[DONE]" {
            return Some(BuiltinEvent::Done);
        }
        let json: serde_json::Value = serde_json::from_str(&data).ok()?;
        let text = json
            .get("choices")?
            .get(0)?
            .get("delta")?
            .get("content")?
            .as_str()?
            .to_string();
        if text.is_empty() {
            return None;
        }
        Some(BuiltinEvent::Delta { text })
    }
}

/// 内置 LLM 流式问答（OpenAI 兼容 API）。
#[tauri::command]
pub async fn builtin_chat(
    win: tauri::Window,
    question: String,
    api_key: String,
    base_url: String,
    model: String,
    history: Vec<HistoryMessage>,
    on_event: Channel<BuiltinEvent>,
) -> Result<(), String> {
    if question.trim().is_empty() {
        return Err("问题不能为空".into());
    }
    if api_key.trim().is_empty() {
        return Err("未配置 LLM_API_KEY，请在 .env 中设置".into());
    }

    let base = base_or(&base_url, DEFAULT_LLM_BASE);
    // 智能拼接：base 已含 /v1 后缀时不重复拼接（兼容 https://api.example.com/v1 和 https://api.example.com 两种写法）
    let base_trimmed = base.trim_end_matches('/');
    let url = if base_trimmed.ends_with("/v1") {
        format!("{}/chat/completions", base_trimmed)
    } else {
        format!("{}/v1/chat/completions", base_trimmed)
    };
    let key = api_key.trim().to_string();
    let model = if model.trim().is_empty() {
        "deepseek-chat".to_string()
    } else {
        model.trim().to_string()
    };

    // 构建完整的 messages：system prompt + 历史对话 + 当前问题（参考 resolve-studio 的做法）
    let mut messages: Vec<serde_json::Value> = Vec::new();
    messages.push(serde_json::json!({"role": "system", "content": BUILTIN_SYSTEM_PROMPT}));
    for msg in &history {
        // 只保留 user 和 assistant 角色的历史消息，过滤掉其他角色
        if msg.role == "user" || msg.role == "assistant" {
            messages.push(serde_json::json!({"role": msg.role, "content": msg.content}));
        }
    }
    messages.push(serde_json::json!({"role": "user", "content": question}));

    spawn_task(win.label().to_string(), on_event, move || {
        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true,
        });
        async move {
            reqwest::Client::new()
                .post(&url)
                .header("Authorization", format!("Bearer {key}"))
                .header("Content-Type", "application/json")
                .body(body.to_string())
                .send()
                .await
                .map_err(|e| format!("请求 LLM 失败: {e}"))
        }
    })
}

/// 停止内置 LLM 任务（"停止"按钮调用）。
#[tauri::command]
pub async fn builtin_chat_abort(win: String) -> Result<(), String> {
    crate::resolve::abort_task(&win);
    Ok(())
}

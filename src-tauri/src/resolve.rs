//! 后端桥接公共模块：常量 / SSE 工具 / 任务管理。
//! 各后端具体实现见 resolve_studio.rs / spring_harness.rs / harness.rs / panel.rs。

use futures_util::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::future::Future;
use std::sync::{Mutex, OnceLock};
use tauri::ipc::Channel;

/// 兜底默认地址（前端未传时使用）。
pub(crate) const DEFAULT_RESOLVE_BASE: &str = "http://127.0.0.1:8787";
pub(crate) const DEFAULT_SPRING_BASE: &str = "http://127.0.0.1:8080";
pub(crate) const DEFAULT_HARNESS_BASE: &str = "http://127.0.0.1:8899";

pub(crate) fn base_or(base: &str, default: &str) -> String {
    if base.trim().is_empty() {
        default.to_string()
    } else {
        base.trim().to_string()
    }
}

/// 简易 URL 编码（保留路径字符与空格编码）。
pub(crate) fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// 提取帧里的 `event:` 与 `data:` 行（兼容只有 data 的帧）。
pub(crate) fn split_frame(frame: &str) -> (String, String) {
    let mut event = String::new();
    let mut data_lines: Vec<String> = Vec::new();
    for line in frame.lines() {
        if let Some(v) = line.strip_prefix("event:") {
            event = v.trim().to_string();
        } else if let Some(v) = line.strip_prefix("data:") {
            // 标准 SSE：多个 data: 行应用换行符连接
            data_lines.push(v.trim().to_string());
        }
    }
    let data = data_lines.join("\n");
    (event, data)
}

// ---- 后台任务管理（按窗口 label 登记，停止时 abort） ----

static ACTIVE_TASKS: OnceLock<Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>> =
    OnceLock::new();

fn active_tasks() -> &'static Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>> {
    ACTIVE_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 中断指定窗口的后台任务（"停止"按钮调用）。
pub(crate) fn abort_task(win: &str) {
    if let Ok(mut guard) = active_tasks().lock() {
        if let Some(h) = guard.remove(win) {
            h.abort();
        }
    }
}

/// 登记一个窗口的后台任务（后续可通过 abort_task 中断）。
pub(crate) fn register_task(win: &str, handle: tauri::async_runtime::JoinHandle<()>) {
    if let Ok(mut guard) = active_tasks().lock() {
        guard.insert(win.to_string(), handle);
    }
}

// ---- SSE 公共约束与工具 ----

/// SSE 事件流的公共约束：可序列化 + 可构造错误事件 + 可解析一个 SSE 帧。
pub(crate) trait StreamEvent: Serialize + Clone + Send + Sync + 'static {
    fn error_event(message: String) -> Self;
    fn parse(frame: &str) -> Option<Self>;
}

/// 在后台任务里执行一个 SSE 请求：请求成功后走公共 consume_sse 逐帧分发；
/// 失败统一经 on_event 推 `error` 事件。任务按窗口 label 登记，互不干扰。
pub(crate) fn spawn_task<Ev, F, Fut>(
    win: String,
    on_event: Channel<Ev>,
    build: F,
) -> Result<(), String>
where
    Ev: StreamEvent,
    F: FnOnce() -> Fut + Send + 'static,
    Fut: Future<Output = Result<reqwest::Response, String>> + Send + 'static,
{
    abort_task(&win);
    let handle = tauri::async_runtime::spawn(async move {
        if let Err(msg) = run_sse(&on_event, build).await {
            let _ = on_event.send(Ev::error_event(msg));
        }
    });
    register_task(&win, handle);
    Ok(())
}

/// 请求成功后消费 SSE 流并逐帧分发（resolve / spring 共用）。
async fn run_sse<Ev, F, Fut>(on_event: &Channel<Ev>, build: F) -> Result<(), String>
where
    Ev: StreamEvent,
    F: FnOnce() -> Fut + Send,
    Fut: Future<Output = Result<reqwest::Response, String>> + Send,
{
    let resp = build().await?;
    consume_sse(resp, on_event).await
}

/// SSE 解析 + 逐帧分发：帧以空行分隔，残余留在 buf。
async fn consume_sse<Ev>(resp: reqwest::Response, on_event: &Channel<Ev>) -> Result<(), String>
where
    Ev: StreamEvent,
{
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("后端返回 {status}: {text}"));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读取 SSE 流失败: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(idx) = buf.find("\n\n") {
            let frame = buf[..idx].to_string();
            buf.drain(..idx + 2);
            if let Some(ev) = Ev::parse(&frame) {
                if on_event.send(ev).is_err() {
                    return Err("已停止".into());
                }
            }
        }
    }
    if let Some(ev) = Ev::parse(buf.trim_end()) {
        let _ = on_event.send(ev);
    }
    Ok(())
}

//! 子面板窗口管理：open_panel（级联布局 / 限 3 窗 / 透明无边框）。

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use tauri::Manager;

/// 新面板窗口的序号（label 唯一性来源）。
static PANEL_SEQ: Mutex<u32> = Mutex::new(0);

/// 每种面板类型已开的窗口数（用于同类型垂直级联）。
static PANEL_TYPE_COUNT: LazyLock<Mutex<HashMap<String, u32>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 每个面板类型最多同时开的窗口数。
const MAX_PANELS_PER_KIND: usize = 3;

/// 获取母窗口（main）所在的显示器
/// 如果母窗口不存在或获取失败，返回主显示器
fn get_main_monitor(app: &tauri::AppHandle) -> Option<tauri::Monitor> {
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = main.current_monitor() {
            return Some(monitor);
        }
    }
    app.primary_monitor().ok().flatten()
}

/// 获取母窗口的位置和大小
/// 如果母窗口不存在或获取失败，返回母窗口所在显示器的默认位置
fn get_main_window_position(
    app: &tauri::AppHandle,
) -> (tauri::LogicalPosition<f64>, tauri::LogicalSize<f64>) {
    if let Some(main) = app.get_webview_window("main") {
        let scale = main
            .current_monitor()
            .ok()
            .flatten()
            .map(|m| m.scale_factor())
            .unwrap_or(1.0);
        if let (Ok(mpos), Ok(msize)) = (main.outer_position(), main.outer_size()) {
            return (
                mpos.to_logical::<f64>(scale),
                msize.to_logical::<f64>(scale),
            );
        }
    }
    // 母窗口不存在或获取失败，使用母窗口所在显示器的默认位置（右上角）
    let default_w = 400.0;
    let default_h = 600.0;
    let (default_x, default_y) = if let Some(monitor) = get_main_monitor(app) {
        let scale = monitor.scale_factor();
        let screen = monitor.size().to_logical::<f64>(scale);
        ((screen.width - default_w).max(0.0), 0.0)
    } else {
        (0.0, 0.0)
    };
    (
        tauri::LogicalPosition::new(default_x, default_y),
        tauri::LogicalSize::new(default_w, default_h),
    )
}

/// 创建一个小面板窗口（无边框透明，右上角级联摆放）。
#[tauri::command]
pub async fn open_panel(app: tauri::AppHandle, kind: String) -> Result<String, String> {
    let seq = {
        let mut s = PANEL_SEQ.lock().unwrap_or_else(|e| e.into_inner());
        *s += 1;
        *s
    };
    let (label, w, h, kind_index) = match kind.as_str() {
        "resolve" => (format!("resolve-{seq}"), 440.0, 700.0, 0u32),
        "spring" => (format!("spring-{seq}"), 440.0, 700.0, 1u32),
        "harness" => (format!("harness-{seq}"), 440.0, 700.0, 2u32),
        "builtin" => (format!("builtin-{seq}"), 440.0, 700.0, 3u32),
        other => return Err(format!("未知面板类型: {other}")),
    };

    // 限制重复开窗：同类型已达上限时，聚焦序号最大的已有窗口。
    let prefix = format!("{kind}-");
    let windows = app.webview_windows();
    let existing: Vec<_> = windows
        .values()
        .filter(|w| w.label().starts_with(&prefix))
        .collect();
    if existing.len() >= MAX_PANELS_PER_KIND {
        let last = existing
            .iter()
            .max_by_key(|w| {
                w.label()
                    .rsplit('-')
                    .next()
                    .and_then(|n| n.parse::<u32>().ok())
                    .unwrap_or(0)
            })
            .map(|w| w.label().to_string());
        if let Some(lbl) = last {
            if let Some(win) = app.get_webview_window(&lbl) {
                let _ = win.set_always_on_top(true);
                let _ = win.set_focus();
                return Ok(lbl);
            }
        }
    }

    // 该类型的级联序号（同类型上下错开，左右重叠；跨类型左右分列互不重叠）。
    let type_ordinal = {
        let mut m = PANEL_TYPE_COUNT.lock().unwrap_or_else(|e| e.into_inner());
        let n = m.entry(kind.clone()).or_insert(0u32);
        let cur = *n;
        *n += 1;
        cur
    };

    // 位置：与 HUD 主窗口水平对齐（同一行），在其左侧依次分列摆放。
    // 子窗口跟随母窗口的位置：直接使用母窗口的位置来计算子窗口的位置，
    // 这样不管母窗口在主屏幕还是次屏幕，子窗口都会出现在同一个屏幕。
    let offset = (type_ordinal.min(6) as f64) * 28.0;
    let (x, y) = {
        // 使用辅助函数获取母窗口的位置和大小（自动处理母窗口隐藏/不存在的情况）
        let (mp, _ms) = get_main_window_position(&app);

        // 获取母窗口所在的显示器，确保子窗口在显示器范围内
        let monitor = get_main_monitor(&app);
        let (mon_x, _mon_w) = if let Some(mon) = &monitor {
            let scale = mon.scale_factor();
            let pos = mon.position().to_logical::<f64>(scale);
            let size = mon.size().to_logical::<f64>(scale);
            (pos.x, size.width)
        } else {
            (0.0, 1920.0)
        };

        let n_cols = kind_index as f64 + 1.0;
        let needed = n_cols * w + (n_cols - 1.0) * 8.0;
        let avail = mp.x - mon_x; // 相对于显示器左边界的可用空间
                                  // 重叠量：最大 380px（子窗口宽度 440，只留 60px 可见），确保多个子窗口都能在屏幕内
        let ov = if n_cols > 1.0 {
            ((needed - avail) / (n_cols - 1.0)).max(0.0).min(380.0)
        } else {
            0.0
        };
        // 子窗口初始位置向右偏移 50px（与最小化后的位置保持一致）
        // 确保子窗口在显示器范围内（不小于显示器左边界）
        let x_raw = mp.x - w - 8.0 - kind_index as f64 * (w - ov) + 50.0;
        let x = x_raw.max(mon_x + 8.0); // 至少距离显示器左边界 8px
                                        // y 坐标也不要使用 .max(0.0)，否则母窗口在副屏（y坐标为负）时子窗口会跑到主屏
        let y = mp.y + offset;
        (x, y)
    };

    let window =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(&label)
            .inner_size(w, h)
            .position(x, y)
            .transparent(true)
            .always_on_top(true)
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .build()
            .map_err(|e| format!("创建窗口失败: {e}"))?;

    // 立即设置置顶、可见和焦点
    let _ = window.set_always_on_top(true);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();

    // 延迟 150ms 再次设置置顶、可见和焦点，确保生效（解决某些窗口类型置顶不生效的问题）
    let window_clone = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        let _ = window_clone.set_always_on_top(true);
        let _ = window_clone.show();
        let _ = window_clone.unminimize();
        let _ = window_clone.set_focus();
        // 尝试将窗口提到最前面
        let _ = window_clone.set_always_on_top(false);
        let _ = window_clone.set_always_on_top(true);
    });

    Ok(label)
}

/// 通过 label 关闭子窗口（比前端 Window.close() 更可靠，避免无边框透明窗口下的 close 失效问题）。
#[tauri::command]
pub async fn close_panel(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        win.close().map_err(|e| format!("关闭窗口失败: {e}"))?;
        Ok(())
    } else {
        Err(format!("未找到窗口: {label}"))
    }
}

/// 打开设置窗口（不透明、可调整大小、只允许一个实例）。
#[tauri::command]
pub async fn open_settings(app: tauri::AppHandle) -> Result<String, String> {
    // 已存在设置窗口时聚焦它，不重复打开
    let windows = app.webview_windows();
    if let Some(existing) = windows
        .values()
        .find(|w| w.label().starts_with("settings-"))
    {
        let _ = existing.set_always_on_top(true);
        let _ = existing.set_focus();
        return Ok(existing.label().to_string());
    }

    let seq = {
        let mut s = PANEL_SEQ.lock().unwrap_or_else(|e| e.into_inner());
        *s += 1;
        *s
    };
    let label = format!("settings-{seq}");
    let (w, h) = (480.0, 640.0);

    // 位置：母窗口所在屏幕的中央（跟随母窗口，多显示器环境下更友好）
    let (x, y) = if let Some(monitor) = get_main_monitor(&app) {
        let scale = monitor.scale_factor();
        let screen = monitor.size().to_logical::<f64>(scale);
        (
            ((screen.width - w) / 2.0).max(0.0),
            ((screen.height - h) / 2.0).max(0.0),
        )
    } else {
        (0.0, 0.0)
    };

    let window =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title("设置")
            .inner_size(w, h)
            .position(x, y)
            .transparent(false)
            .always_on_top(true)
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .background_color(tauri::window::Color(0x1a, 0x1a, 0x2e, 0xff))
            .build()
            .map_err(|e| format!("创建设置窗口失败: {e}"))?;
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();
    Ok(label)
}

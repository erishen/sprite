//! 托盘菜单：后端状态 + 快捷开窗 + 窗口列表
//!
//! 菜单每 15 秒由后台轮询重建一次：三个后端 health + 当前窗口列表。
//! 菜单项 id 约定：
//!   - `open-panel-{resolve|spring|harness|builtin}` 快捷新开聊天窗
//!   - `focus-{label}` 聚焦/还原某个窗口
//!   - `open-settings` 打开设置窗口
//!   - `show` / `quit` 沿用原语义

use std::time::Duration;

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::{Emitter, Manager, Wry};

use crate::{harness, panel, resolve_studio, spring_harness};

pub fn build_tray_menu(
    app: &tauri::AppHandle,
    resolve: Option<u64>,
    spring: Option<usize>,
    harness_model: Option<String>,
    windows: &[String],
    system_stats: Option<(f32, f64, f64, f64, f64)>, // (cpu%, mem_used_gb, mem_total_gb, disk_used_gb, disk_total_gb)
) -> tauri::Result<Menu<Wry>> {
    let mut items: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();

    // 后端状态区
    items.push(Box::new(MenuItem::with_id(
        app,
        "st-head",
        "后端状态",
        false,
        None::<&str>,
    )?));
    let resolve_text = match resolve {
        Some(tools) => format!("● Resolve Studio · 在线 · {tools} 工具"),
        None => "○ Resolve Studio · 离线".into(),
    };
    items.push(Box::new(MenuItem::with_id(
        app,
        "st-resolve",
        &resolve_text,
        false,
        None::<&str>,
    )?));
    let spring_text = match spring {
        Some(n) => format!("● Spring Harness · 在线 · {n} 模型"),
        None => "○ Spring Harness · 离线".into(),
    };
    items.push(Box::new(MenuItem::with_id(
        app,
        "st-spring",
        &spring_text,
        false,
        None::<&str>,
    )?));
    let harness_text = match harness_model {
        Some(model) => format!("● Resolve Harness · 在线 · {model}"),
        None => "○ Resolve Harness · 离线".into(),
    };
    items.push(Box::new(MenuItem::with_id(
        app,
        "st-harness",
        &harness_text,
        false,
        None::<&str>,
    )?));

    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // 系统资源状态区
    if let Some((cpu, mem_used, mem_total, disk_used, disk_total)) = system_stats {
        items.push(Box::new(MenuItem::with_id(
            app,
            "sys-head",
            "系统资源",
            false,
            None::<&str>,
        )?));
        let mem_percent = if mem_total > 0.0 {
            (mem_used / mem_total * 100.0) as u32
        } else {
            0
        };
        let disk_percent = if disk_total > 0.0 {
            (disk_used / disk_total * 100.0) as u32
        } else {
            0
        };
        items.push(Box::new(MenuItem::with_id(
            app,
            "sys-cpu",
            &format!("CPU: {:.0}%", cpu),
            false,
            None::<&str>,
        )?));
        items.push(Box::new(MenuItem::with_id(
            app,
            "sys-mem",
            &format!(
                "内存: {:.1}/{:.1} GB ({}%)",
                mem_used, mem_total, mem_percent
            ),
            false,
            None::<&str>,
        )?));
        items.push(Box::new(MenuItem::with_id(
            app,
            "sys-disk",
            &format!(
                "磁盘: {:.0}/{:.0} GB ({}%)",
                disk_used, disk_total, disk_percent
            ),
            false,
            None::<&str>,
        )?));
        items.push(Box::new(PredefinedMenuItem::separator(app)?));
    }

    // 快捷开窗
    items.push(Box::new(MenuItem::with_id(
        app,
        "open-panel-resolve",
        "新开 Resolve Studio 聊天窗",
        true,
        None::<&str>,
    )?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "open-panel-spring",
        "新开 Spring Harness 聊天窗",
        true,
        None::<&str>,
    )?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "open-panel-harness",
        "新开 Resolve Harness 聊天窗",
        true,
        None::<&str>,
    )?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "open-panel-builtin",
        "新开内置 LLM 聊天窗",
        true,
        None::<&str>,
    )?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "open-settings",
        "⚙ 设置",
        true,
        None::<&str>,
    )?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "lock-screen",
        "🔒 立即锁定",
        true,
        None::<&str>,
    )?));

    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // 窗口列表（不含 main：Show HUD 已覆盖）
    let panels: Vec<&String> = windows.iter().filter(|l| l.contains('-')).collect();
    items.push(Box::new(MenuItem::with_id(
        app,
        "win-head",
        &format!("窗口（{}）", panels.len()),
        false,
        None::<&str>,
    )?));
    if panels.is_empty() {
        items.push(Box::new(MenuItem::with_id(
            app,
            "win-none",
            "（无已开面板）",
            false,
            None::<&str>,
        )?));
    } else {
        for lbl in panels {
            items.push(Box::new(MenuItem::with_id(
                app,
                &format!("focus-{lbl}"),
                &format!("⇱ {lbl}"),
                true,
                None::<&str>,
            )?));
        }
    }

    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    items.push(Box::new(MenuItem::with_id(
        app,
        "show",
        "Show HUD",
        true,
        None::<&str>,
    )?));
    items.push(Box::new(MenuItem::with_id(
        app,
        "quit",
        "Quit",
        true,
        None::<&str>,
    )?));

    let refs: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(|b| b.as_ref()).collect();
    Menu::with_items(app, &refs)
}

/// 后台轮询：三后端健康 + 窗口列表 + 系统资源 → 重建托盘菜单。
pub fn start_tray_poll(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            // 与前端 .env 默认一致的后端地址。
            let (r, s, h, sys) = futures_util::join!(
                async { resolve_studio::resolve_health("http://127.0.0.1:8787".into()).await },
                async { spring_harness::spring_models("http://127.0.0.1:8080".into()).await },
                async { harness::harness_health("http://127.0.0.1:8899".into()).await },
                async { crate::system_stats::system_stats().await }
            );
            let resolve_det = r.ok.then_some(r.tools);
            let spring_det = s.ok().map(|v| v.len());
            let harness_det = h.ok.then_some(h.model.clone());
            let system_det = Some((
                sys.cpu,
                sys.mem_used_gb,
                sys.mem_total_gb,
                sys.disk_used_gb,
                sys.disk_total_gb,
            ));
            let windows: Vec<String> = app.webview_windows().keys().cloned().collect();
            if let Ok(menu) = build_tray_menu(
                &app,
                resolve_det,
                spring_det,
                harness_det,
                &windows,
                system_det,
            ) {
                if let Some(tray) = app.tray_by_id("hud-tray") {
                    let _ = tray.set_menu(Some(menu));
                }
            }
            tokio::time::sleep(Duration::from_secs(15)).await;
        }
    });
}

/// 处理托盘菜单事件
pub fn handle_menu_event(app: &tauri::AppHandle, event: &tauri::menu::MenuEvent) {
    match event.id.as_ref() {
        "quit" => app.exit(0),
        "show" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        id if id.starts_with("open-panel-") => {
            let kind = id.trim_start_matches("open-panel-").to_string();
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = panel::open_panel(app, kind).await;
            });
        }
        "open-settings" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = panel::open_settings(app).await;
            });
        }
        "lock-screen" => {
            // 发送锁屏事件给所有窗口，前端收到后锁定应用
            let _ = app.emit("lock-screen", ());
        }
        id if id.starts_with("focus-") => {
            let lbl = id.trim_start_matches("focus-").to_string();
            if let Some(w) = app.get_webview_window(&lbl) {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        _ => {}
    }
}

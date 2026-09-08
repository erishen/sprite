//! Sprite — 桌面精灵 / 桌面悬浮助手
//!
//! 主入口：注册 Tauri 命令、初始化全局热键、托盘图标、窗口定位。
//! 业务逻辑已拆分到独立模块：
//!   - system_stats: 系统监控（CPU/内存/磁盘/网络）
//!   - launcher: 本地应用/脚本启动
//!   - tray: 托盘菜单构建与轮询
//!   - resolve_studio / spring_harness / harness: 三个后端服务对接
//!   - panel: 子窗口管理
//!   - builtin: 内置 LLM
//!   - settings: 设置管理
//!   - history: 聊天历史

use tauri::tray::TrayIconBuilder;
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod builtin;
mod export;
mod harness;
mod history;
mod hotkey;
mod keychain;
mod launcher;
mod panel;
mod resize;
mod resolve;
mod resolve_studio;
mod settings;
mod spring_harness;
mod system_stats;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            system_stats::system_stats,
            launcher::launch,
            resize::begin_resize,
            keychain::keychain_save,
            keychain::keychain_get,
            keychain::keychain_delete,
            keychain::keychain_available,
            resolve_studio::resolve_health,
            resolve_studio::resolve_chat,
            resolve_studio::resolve_chat_abort,
            resolve_studio::resolve_approve,
            resolve_studio::resolve_tool_run,
            resolve_studio::resolve_file,
            spring_harness::spring_chat,
            spring_harness::spring_models,
            spring_harness::spring_info,
            harness::harness_chat,
            harness::harness_health,
            harness::harness_models,
            harness::harness_approve,
            harness::fetch_examples,
            panel::open_panel,
            panel::close_panel,
            panel::open_settings,
            history::load_history,
            history::save_history,
            builtin::builtin_chat,
            builtin::builtin_chat_abort,
            settings::load_settings,
            settings::save_settings,
            export::save_export_file,
            hotkey::register_toggle_hotkey,
            hotkey::unregister_all_hotkeys
        ])
        .setup(|app| {
            // Park the window in the top-right corner of the primary monitor.
            if let Some(window) = app.get_webview_window("main") {
                if let Some(monitor) = app.primary_monitor()? {
                    let scale = monitor.scale_factor();
                    let screen = monitor.size().to_logical::<f64>(scale);
                    let win = window
                        .outer_size()
                        .unwrap_or_default()
                        .to_logical::<f64>(scale);
                    let margin = 0.0;
                    let _ = window.set_position(tauri::LogicalPosition::new(
                        (screen.width - win.width - margin).max(0.0),
                        margin,
                    ));
                }
            }

            // 全局热键：从设置中读取热键配置，默认 Cmd+Option+D
            // 注意：on_shortcut 会自动注册热键，不需要先调用 register（否则会重复注册导致失败）
            let hotkey_str = {
                // 尝试从设置文件读取热键配置
                let app_handle = app.handle().clone();
                match settings::settings_path(&app_handle) {
                    Ok(path) if path.exists() => match std::fs::read_to_string(&path) {
                        Ok(content) => match serde_json::from_str::<serde_json::Value>(&content) {
                            Ok(json) => json
                                .get("hotkey")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| hotkey::default_hotkey().to_string()),
                            Err(_) => hotkey::default_hotkey().to_string(),
                        },
                        Err(_) => hotkey::default_hotkey().to_string(),
                    },
                    _ => hotkey::default_hotkey().to_string(),
                }
            };

            match hotkey::parse_hotkey(&hotkey_str) {
                Ok(toggle_shortcut) => {
                    if let Err(e) = app.global_shortcut().on_shortcut(
                        toggle_shortcut,
                        |app, _shortcut, event| {
                            if event.state() != ShortcutState::Pressed {
                                return;
                            }
                            if let Some(win) = app.get_webview_window("main") {
                                let visible = win.is_visible().unwrap_or(false);
                                if visible {
                                    let _ = win.hide();
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                        },
                    ) {
                        eprintln!(
                            "[sprite] 全局热键 {} 注册失败（可能被其他应用占用）: {e}",
                            hotkey_str
                        );
                        eprintln!("[sprite] 热键功能不可用，但仍可通过托盘图标唤起/隐藏窗口");
                    } else {
                        println!("[sprite] 全局热键已注册: {}", hotkey_str);
                    }
                }
                Err(e) => {
                    eprintln!("[sprite] 解析热键 {} 失败: {}", hotkey_str, e);
                    eprintln!("[sprite] 使用默认热键 Cmd+Option+D");
                    let default_shortcut =
                        Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyD);
                    let _ = app.global_shortcut().on_shortcut(
                        default_shortcut,
                        |app, _shortcut, event| {
                            if event.state() != ShortcutState::Pressed {
                                return;
                            }
                            if let Some(win) = app.get_webview_window("main") {
                                let visible = win.is_visible().unwrap_or(false);
                                if visible {
                                    let _ = win.hide();
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                        },
                    );
                }
            }

            let menu = tray::build_tray_menu(app.handle(), None, None, None, &[], None)?;
            // 安全获取默认窗口图标，避免 unwrap 导致 panic
            let tray_icon = app.default_window_icon().cloned();
            let mut tray_builder = TrayIconBuilder::with_id("hud-tray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    tray::handle_menu_event(&app, &event);
                })
                .on_tray_icon_event(|tray, event| {
                    // 左键点击托盘图标：还原最近收起的面板窗（label 含 "-"），
                    // 否则还原 HUD 主窗口——相当于从"系统图标区"恢复窗口。
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        for (lbl, w) in app.webview_windows() {
                            if lbl.contains('-') && !w.is_visible().unwrap_or(true) {
                                let _ = w.show();
                                let _ = w.set_focus();
                                return;
                            }
                        }
                        if let Some(main) = app.get_webview_window("main") {
                            let _ = main.show();
                            let _ = main.set_focus();
                        }
                    }
                });
            // 安全设置托盘图标（如果默认窗口图标存在）
            if let Some(icon) = tray_icon {
                tray_builder = tray_builder.icon(icon);
            }
            let _tray = tray_builder.build(app)?;

            // 托盘菜单状态轮询（后端在线 + 窗口列表，15s 刷新）。
            tray::start_tray_poll(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

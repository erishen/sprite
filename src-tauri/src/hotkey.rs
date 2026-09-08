//! 全局热键管理模块
//!
//! 支持动态注册/注销全局热键，热键格式为 "Cmd+Option+D" 这样的字符串。

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

/// 解析热键字符串为 Shortcut
/// 支持的格式："Cmd+Option+D"、"Ctrl+Shift+P"、"Alt+Space" 等
/// 修饰键：Cmd/Command/Meta, Ctrl/Control, Alt/Option, Shift
pub fn parse_hotkey(hotkey_str: &str) -> Result<Shortcut, String> {
    let parts: Vec<&str> = hotkey_str
        .split('+')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    if parts.is_empty() {
        return Err("热键不能为空".to_string());
    }

    // 最后一个部分是按键，前面的是修饰键
    let key_str = parts.last().unwrap().to_uppercase();
    let modifiers_str = &parts[..parts.len() - 1];

    // 解析修饰键
    let mut modifiers = Modifiers::empty();
    for mod_str in modifiers_str {
        match mod_str.to_uppercase().as_str() {
            "CMD" | "COMMAND" | "META" | "SUPER" => modifiers |= Modifiers::SUPER,
            "CTRL" | "CONTROL" => modifiers |= Modifiers::CONTROL,
            "ALT" | "OPTION" => modifiers |= Modifiers::ALT,
            "SHIFT" => modifiers |= Modifiers::SHIFT,
            _ => return Err(format!("未知修饰键: {}", mod_str)),
        }
    }

    // 解析按键
    let code = parse_key_code(&key_str)?;

    Ok(Shortcut::new(Some(modifiers), code))
}

/// 解析按键字符串为 Code
fn parse_key_code(key_str: &str) -> Result<Code, String> {
    match key_str {
        // 字母键
        "A" => Ok(Code::KeyA),
        "B" => Ok(Code::KeyB),
        "C" => Ok(Code::KeyC),
        "D" => Ok(Code::KeyD),
        "E" => Ok(Code::KeyE),
        "F" => Ok(Code::KeyF),
        "G" => Ok(Code::KeyG),
        "H" => Ok(Code::KeyH),
        "I" => Ok(Code::KeyI),
        "J" => Ok(Code::KeyJ),
        "K" => Ok(Code::KeyK),
        "L" => Ok(Code::KeyL),
        "M" => Ok(Code::KeyM),
        "N" => Ok(Code::KeyN),
        "O" => Ok(Code::KeyO),
        "P" => Ok(Code::KeyP),
        "Q" => Ok(Code::KeyQ),
        "R" => Ok(Code::KeyR),
        "S" => Ok(Code::KeyS),
        "T" => Ok(Code::KeyT),
        "U" => Ok(Code::KeyU),
        "V" => Ok(Code::KeyV),
        "W" => Ok(Code::KeyW),
        "X" => Ok(Code::KeyX),
        "Y" => Ok(Code::KeyY),
        "Z" => Ok(Code::KeyZ),
        // 数字键
        "0" => Ok(Code::Digit0),
        "1" => Ok(Code::Digit1),
        "2" => Ok(Code::Digit2),
        "3" => Ok(Code::Digit3),
        "4" => Ok(Code::Digit4),
        "5" => Ok(Code::Digit5),
        "6" => Ok(Code::Digit6),
        "7" => Ok(Code::Digit7),
        "8" => Ok(Code::Digit8),
        "9" => Ok(Code::Digit9),
        // 功能键
        "F1" => Ok(Code::F1),
        "F2" => Ok(Code::F2),
        "F3" => Ok(Code::F3),
        "F4" => Ok(Code::F4),
        "F5" => Ok(Code::F5),
        "F6" => Ok(Code::F6),
        "F7" => Ok(Code::F7),
        "F8" => Ok(Code::F8),
        "F9" => Ok(Code::F9),
        "F10" => Ok(Code::F10),
        "F11" => Ok(Code::F11),
        "F12" => Ok(Code::F12),
        // 特殊键
        "SPACE" | " " => Ok(Code::Space),
        "ENTER" | "RETURN" => Ok(Code::Enter),
        "ESC" | "ESCAPE" => Ok(Code::Escape),
        "TAB" => Ok(Code::Tab),
        "BACKSPACE" => Ok(Code::Backspace),
        "DELETE" | "DEL" => Ok(Code::Delete),
        "HOME" => Ok(Code::Home),
        "END" => Ok(Code::End),
        "PAGEUP" | "PAGE_UP" => Ok(Code::PageUp),
        "PAGEDOWN" | "PAGE_DOWN" => Ok(Code::PageDown),
        "UP" | "ARROWUP" => Ok(Code::ArrowUp),
        "DOWN" | "ARROWDOWN" => Ok(Code::ArrowDown),
        "LEFT" | "ARROWLEFT" => Ok(Code::ArrowLeft),
        "RIGHT" | "ARROWRIGHT" => Ok(Code::ArrowRight),
        _ => Err(format!("未知按键: {}", key_str)),
    }
}

/// 注册全局热键（显示/隐藏主窗口）
#[tauri::command]
pub fn register_toggle_hotkey(app: AppHandle, hotkey_str: String) -> Result<(), String> {
    let shortcut = parse_hotkey(&hotkey_str)?;

    // 先注销所有热键，避免重复注册
    if let Err(e) = app.global_shortcut().unregister_all() {
        eprintln!("[sprite] 注销旧热键失败: {e}");
    }

    // 注册新热键
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state() != tauri_plugin_global_shortcut::ShortcutState::Pressed {
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
        })
        .map_err(|e| format!("注册热键失败: {e}"))?;

    println!("[sprite] 全局热键已注册: {}", hotkey_str);
    Ok(())
}

/// 注销所有全局热键
#[tauri::command]
pub fn unregister_all_hotkeys(app: AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("注销热键失败: {e}"))?;
    println!("[sprite] 所有全局热键已注销");
    Ok(())
}

/// 获取默认热键字符串
pub fn default_hotkey() -> &'static str {
    "Cmd+Option+D"
}

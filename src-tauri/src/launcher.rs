//! 本地应用/脚本启动器
//!
//! HUD 按钮发送 `kind` + `target` 到这里。`kind` 是 app/bundle/script；
//! `target` 被视为受信任的命令（来自用户自己的 LAUNCHERS 配置，不是远程内容）。
//!
//! 进程以 detached 方式启动（null stdio，不等待），所以长时间运行的工具
//! （dev servers、脚本）在点击返回后仍会继续运行。

use std::process::{Command, Stdio};

fn spawn_detached(mut cmd: Command) -> Result<(), String> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("无法启动进程: {e}"))
}

/// macOS: `open -a "<AppName>"` — LaunchServices picks the right app by name.
#[cfg(target_os = "macos")]
fn launch_app(name: &str) -> Result<(), String> {
    let mut cmd = Command::new("/usr/bin/open");
    cmd.arg("-a").arg(name);
    spawn_detached(cmd).map_err(|e| format!("启动应用「{name}」失败: {e}"))
}

/// Windows: `start "" "<name>"` via cmd.
#[cfg(target_os = "windows")]
fn launch_app(name: &str) -> Result<(), String> {
    let mut cmd = Command::new("cmd");
    cmd.arg("/C").arg("start").arg("").arg(name);
    spawn_detached(cmd).map_err(|e| format!("启动应用「{name}」失败: {e}"))
}

/// Linux: assume `name` is an executable on PATH (e.g. "code", "kitty").
#[cfg(all(unix, not(target_os = "macos")))]
fn launch_app(name: &str) -> Result<(), String> {
    let mut cmd = Command::new(name);
    spawn_detached(cmd).map_err(|e| format!("启动应用「{name}」失败: {e}"))
}

/// macOS: `open -b "<bundle-id>"` — exact app by bundle identifier（避免同名/歧义）。
#[cfg(target_os = "macos")]
fn launch_bundle(bundle_id: &str) -> Result<(), String> {
    let mut cmd = Command::new("/usr/bin/open");
    cmd.arg("-b").arg(bundle_id);
    spawn_detached(cmd).map_err(|e| format!("启动应用「{bundle_id}」失败: {e}"))
}

#[cfg(not(target_os = "macos"))]
fn launch_bundle(bundle_id: &str) -> Result<(), String> {
    // 非 macOS：无 bundle id 概念，回退按名称启动
    launch_app(bundle_id)
}

/// Run an arbitrary shell one-liner (script path, `cd x && make dev`, ...).
#[cfg(not(target_os = "windows"))]
fn run_script(script: &str) -> Result<(), String> {
    let mut cmd = Command::new("/bin/sh");
    cmd.arg("-c").arg(script);
    spawn_detached(cmd).map_err(|e| format!("运行脚本失败: {e}"))
}

#[cfg(target_os = "windows")]
fn run_script(script: &str) -> Result<(), String> {
    let mut cmd = Command::new("cmd");
    cmd.arg("/C").arg(script);
    spawn_detached(cmd).map_err(|e| format!("运行脚本失败: {e}"))
}

/// Launch a local app ("app") / by bundle id ("bundle") / or run a shell command ("script").
#[tauri::command]
pub fn launch(kind: String, target: String) -> Result<(), String> {
    if target.trim().is_empty() {
        return Err("空的启动目标".into());
    }
    match kind.as_str() {
        "app" => launch_app(&target),
        "bundle" => launch_bundle(&target),
        "script" => run_script(&target),
        other => Err(format!("未知的 launch 类型: {other}")),
    }
}

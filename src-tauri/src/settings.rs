//! 设置管理：加载/保存用户配置到本地 JSON 文件。
//! 配置存储在 app_data_dir/settings.json，打包后也能修改，不依赖 .env。
//! 注意：settings.json 可能含 API key / token，写入必须 0600。

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

/// 内置 LLM 配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

/// Resolve Studio 后端配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResolveConfig {
    pub base_url: String,
}

/// Spring Harness 后端配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SpringConfig {
    pub base_url: String,
    pub model: String,
}

/// Resolve Harness 后端配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HarnessConfig {
    pub base_url: String,
    pub api_token: String,
    pub model: String,
}

/// 默认应用标题
fn default_app_title() -> String {
    "ESN".to_string()
}

/// 默认开启番茄时钟
fn default_true() -> bool {
    true
}

/// 默认全局热键
fn default_hotkey() -> String {
    "Cmd+Option+D".to_string()
}

/// 完整设置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_app_title")]
    pub app_title: String,
    #[serde(default = "default_true")]
    pub pomodoro_enabled: bool,
    #[serde(default = "default_true")]
    pub system_monitor_enabled: bool,
    #[serde(default = "default_true")]
    pub clipboard_history_enabled: bool,
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
    #[serde(default)]
    pub lock_enabled: bool,
    #[serde(default)]
    pub lock_password: String,
    #[serde(default)]
    pub auto_lock_minutes: u64,
    #[serde(default)]
    pub master_password_enabled: bool,
    #[serde(default)]
    pub master_password: String,
    #[serde(default)]
    pub use_keychain: bool,
    #[serde(default)]
    pub builtin: BuiltinConfig,
    #[serde(default)]
    pub resolve: ResolveConfig,
    #[serde(default)]
    pub spring: SpringConfig,
    #[serde(default)]
    pub harness: HarnessConfig,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            app_title: "ESN".to_string(),
            pomodoro_enabled: true,
            system_monitor_enabled: true,
            clipboard_history_enabled: true,
            hotkey: "Cmd+Option+D".to_string(),
            lock_enabled: false,
            lock_password: String::new(),
            auto_lock_minutes: 0,
            master_password_enabled: false,
            master_password: String::new(),
            use_keychain: false,
            builtin: BuiltinConfig::default(),
            resolve: ResolveConfig::default(),
            spring: SpringConfig::default(),
            harness: HarnessConfig::default(),
        }
    }
}

/// 将文件权限收紧为仅所有者可读写（Unix 0600）。
/// 不存在的文件、非 Unix 平台或权限设置失败时静默忽略。
fn tighten_file_permissions(path: &std::path::Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
}

/// 获取配置文件路径
pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 app_data_dir 失败: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    Ok(dir.join("settings.json"))
}

/// 加载设置（文件不存在时返回默认值）
#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<Settings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取配置文件失败: {e}"))?;
    let settings: Settings =
        serde_json::from_str(&content).map_err(|e| format!("解析配置文件失败: {e}"))?;
    Ok(settings)
}

/// 保存设置
#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let json =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("序列化配置失败: {e}"))?;
    write_private(&path, &json).map_err(|e| format!("写入配置文件失败: {e}"))?;
    // 保存成功后发送全局事件，通知所有窗口重新加载设置
    let _ = app.emit("settings-updated", ());
    Ok(())
}

/// 以 0600 权限写入文件（settings.json 可能含 API key / token）。
/// 使用 OpenOptions + mode，避免 fs::write 默认 0644 暴露给本机其他用户。
fn write_private(path: &PathBuf, content: &str) -> std::io::Result<()> {
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    opts.mode(0o600);
    let mut f = opts.open(path)?;
    f.write_all(content.as_bytes())
}

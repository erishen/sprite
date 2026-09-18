use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// 将目录权限收紧为仅所有者可读写执行（Unix 0700）。
#[cfg(unix)]
fn tighten_dir_permissions(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
}

/// 将文件权限收紧为仅所有者可读写（Unix 0600）。
#[cfg(unix)]
fn tighten_file_permissions(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

/// 历史文件存储目录：app_data_dir()/history/（目录权限 0700）
fn history_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 app_data_dir 失败: {e}"))?
        .join("history");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建 history 目录失败: {e}"))?;
    }
    #[cfg(unix)]
    tighten_dir_permissions(&dir);
    Ok(dir)
}

/// 加载指定窗口的对话历史（JSON 字符串）。文件不存在时返回 None。
#[tauri::command]
pub async fn load_history(app: AppHandle, label: String) -> Result<Option<String>, String> {
    let path = history_dir(&app)?.join(format!("{label}.json"));
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取历史文件失败: {e}"))?;
    Ok(Some(content))
}

/// 保存指定窗口的对话历史（JSON 字符串）。空内容时删除文件。文件权限 0600。
#[tauri::command]
pub async fn save_history(app: AppHandle, label: String, json: String) -> Result<(), String> {
    let path = history_dir(&app)?.join(format!("{label}.json"));
    if json.is_empty() || json == "[]" {
        // 空历史：删除文件
        if path.exists() {
            let _ = fs::remove_file(&path);
        }
        return Ok(());
    }
    fs::write(&path, &json).map_err(|e| format!("写入历史文件失败: {e}"))?;
    #[cfg(unix)]
    tighten_file_permissions(&path);
    Ok(())
}

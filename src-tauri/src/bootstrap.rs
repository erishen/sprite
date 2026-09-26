//! 首次启动导入内置数据（打包在 Contents/Resources 中）。
//!
//! 安装包可随 app 分发默认 settings.json 和 history，本模块仅在目标
//! 数据缺失时写入，绝不覆盖用户已有数据。
//!
//! 资源布局（扁平，见 tauri.conf.json 的 bundle.resources）：
//!   resources/settings.json      → app_data_dir/settings.json
//!   resources/*.json (其余)      → app_data_dir/history/<同名>
//! 扁平而非嵌套 history/，是为了只用一个 glob（`resources/*`）：Tauri 对
//! 无任何匹配的 glob 会直接构建失败，而 `resources/*` 总能被已提交的
//! README.md 命中，因此个人数据可以整个 gitignore 掉。

use std::fs;
use std::path::Path;

use tauri::{App, Manager};

/// 将 src 复制到 dst，仅当 dst 不存在时执行，并确保父目录存在。
fn copy_if_missing(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() {
        return Ok(());
    }
    let parent = dst
        .parent()
        .ok_or_else(|| format!("目标路径缺少父目录: {}", dst.display()))?;
    fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {}: {e}", parent.display()))?;
    fs::copy(src, dst)
        .map_err(|e| format!("复制失败 {} -> {}: {e}", src.display(), dst.display()))?;
    Ok(())
}

/// 将历史目录内所有文件收紧为 0600，目录本身 0700。
/// settings.json 单独 0600（由 ensure_private 处理）。
fn harden_permissions(app_data_dir: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let settings_path = app_data_dir.join("settings.json");
    if settings_path.exists() {
        if let Ok(meta) = fs::metadata(&settings_path) {
            let mut p = meta.permissions();
            p.set_mode(0o600);
            let _ = fs::set_permissions(&settings_path, p);
        }
    }

    let history_dir = app_data_dir.join("history");
    if history_dir.is_dir() {
        if let Ok(meta) = fs::metadata(&history_dir) {
            let mut p = meta.permissions();
            p.set_mode(0o700);
            let _ = fs::set_permissions(&history_dir, p);
        }
        if let Ok(entries) = fs::read_dir(&history_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Ok(meta) = fs::metadata(&path) {
                        let mut p = meta.permissions();
                        p.set_mode(0o600);
                        let _ = fs::set_permissions(&path, p);
                    }
                }
            }
        }
    }
}

/// 将内置资源中的 settings.json 与其余 *.json 导入 app_data_dir（仅缺失时）。
pub fn seed_user_data(app: &App) {
    let resource_dir = match app.path().resource_dir() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("[sprite] 获取 resource_dir 失败: {e}");
            return;
        }
    };
    let app_data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("[sprite] 获取 app_data_dir 失败: {e}");
            return;
        }
    };

    let seed_dir = resource_dir.join("resources");
    if !seed_dir.is_dir() {
        return;
    }

    let entries = match fs::read_dir(&seed_dir) {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!("[sprite] 读取内置资源目录失败: {e}");
            return;
        }
    };

    let history_dir = app_data_dir.join("history");
    for entry in entries.flatten() {
        let src = entry.path();
        if !src.is_file() {
            continue;
        }
        let Some(name) = src.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        // 只处理 JSON 种子数据，README.md 等占位文件跳过
        if !name.ends_with(".json") {
            continue;
        }

        let dst = if name == "settings.json" {
            app_data_dir.join(name)
        } else {
            history_dir.join(name)
        };

        if let Err(e) = copy_if_missing(&src, &dst) {
            eprintln!("[sprite] 导入 {} 失败: {e}", name);
        }
    }

    // 权限加固：settings.json 可能含 API key，history/*.json 是对话/思考链，
    // 均收紧为 0600（目录 0700）。写入路径已 0600，此处兜底修复早期 0644 文件。
    harden_permissions(&app_data_dir);
}

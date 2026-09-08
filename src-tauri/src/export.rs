//! 文件导出模块
//!
//! 提供导出聊天记录、数据等内容到本地文件的功能。
//! 文件默认保存到用户的下载目录（~/Downloads）。

use std::fs;
use std::path::PathBuf;

/// 保存导出的文件到下载目录
///
/// # 参数
/// - `file_name`: 文件名（包含扩展名）
/// - `content`: 文件内容
///
/// # 返回
/// - 成功时返回保存的完整路径
/// - 失败时返回错误信息
#[tauri::command]
pub async fn save_export_file(file_name: String, content: String) -> Result<String, String> {
    // 获取用户主目录
    let home = std::env::var("HOME").map_err(|e| format!("获取用户主目录失败: {e}"))?;

    // 构建下载目录路径
    let downloads_dir = PathBuf::from(&home).join("Downloads");

    // 确保下载目录存在
    if !downloads_dir.exists() {
        fs::create_dir_all(&downloads_dir)
            .map_err(|e| format!("创建下载目录失败: {e}"))?;
    }

    // 构建完整文件路径
    let file_path = downloads_dir.join(&file_name);

    // 写入文件
    fs::write(&file_path, content).map_err(|e| format!("写入文件失败: {e}"))?;

    // 返回保存的路径
    let path_str = file_path
        .to_str()
        .ok_or_else(|| "文件路径转换失败".to_string())?
        .to_string();

    println!("[sprite] 文件导出成功: {}", path_str);
    Ok(path_str)
}

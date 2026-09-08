//! 窗口调整大小模块
//!
//! 提供自定义命令来启动窗口调整大小（使用 Tauri 原生的 start_resize_dragging）。

/// 启动窗口调整大小（自定义命令，确保参数格式正确）
/// direction: East / West / South / North / SouthEast / SouthWest / NorthEast / NorthWest
#[tauri::command]
pub fn begin_resize(window: tauri::Window, direction: String) -> Result<(), String> {
    let dir = match direction.as_str() {
        "East" => tauri_runtime::ResizeDirection::East,
        "West" => tauri_runtime::ResizeDirection::West,
        "South" => tauri_runtime::ResizeDirection::South,
        "North" => tauri_runtime::ResizeDirection::North,
        "SouthEast" => tauri_runtime::ResizeDirection::SouthEast,
        "SouthWest" => tauri_runtime::ResizeDirection::SouthWest,
        "NorthEast" => tauri_runtime::ResizeDirection::NorthEast,
        "NorthWest" => tauri_runtime::ResizeDirection::NorthWest,
        _ => return Err(format!("未知的调整方向: {}", direction)),
    };
    window
        .start_resize_dragging(dir)
        .map_err(|e| format!("启动调整大小失败: {}", e))
}

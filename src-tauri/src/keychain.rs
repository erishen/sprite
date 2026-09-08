//! Keychain 管理模块
//!
//! 使用 macOS 的 `security` 命令行工具来访问系统钥匙串，
//! 用于安全存储 API Key 等敏感信息。
//!
//! 注意：这是简化实现，使用命令行工具而不是原生 Keychain API。
//! 更高安全需求建议使用 `security-framework` crate 直接调用原生 API。

use std::process::Command;

/// Keychain 服务名称（用于区分不同应用的密码项）
const SERVICE_NAME: &str = "sprite";

/// 保存密码到 Keychain（Tauri 命令）
#[tauri::command]
pub fn keychain_save(account: String, password: String) -> Result<(), String> {
    save_password(&account, &password)
}

/// 从 Keychain 读取密码（Tauri 命令）
#[tauri::command]
pub fn keychain_get(account: String) -> Result<Option<String>, String> {
    get_password(&account)
}

/// 从 Keychain 删除密码（Tauri 命令）
#[tauri::command]
pub fn keychain_delete(account: String) -> Result<(), String> {
    delete_password(&account)
}

/// 检查 Keychain 是否可用（Tauri 命令）
#[tauri::command]
pub fn keychain_available() -> bool {
    is_keychain_available()
}

/// 保存密码到 Keychain
///
/// # Arguments
/// * `account` - 账户名称（如 "builtin-api-key"、"resolve-api-token"）
/// * `password` - 要保存的密码
///
/// # Returns
/// * `Ok(())` - 保存成功
/// * `Err(String)` - 保存失败，包含错误信息
pub fn save_password(account: &str, password: &str) -> Result<(), String> {
    // 使用 security add-generic-password 命令保存密码
    // -U 表示如果已存在则更新
    let output = Command::new("security")
        .args([
            "add-generic-password",
            "-s",
            SERVICE_NAME,
            "-a",
            account,
            "-w",
            password,
            "-U",
        ])
        .output()
        .map_err(|e| format!("执行 security 命令失败: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("保存密码到 Keychain 失败: {stderr}"))
    }
}

/// 从 Keychain 读取密码
///
/// # Arguments
/// * `account` - 账户名称
///
/// # Returns
/// * `Ok(Some(String))` - 读取成功，返回密码
/// * `Ok(None)` - 密码不存在
/// * `Err(String)` - 读取失败，包含错误信息
pub fn get_password(account: &str) -> Result<Option<String>, String> {
    // 使用 security find-generic-password 命令读取密码
    // -w 表示只输出密码
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            SERVICE_NAME,
            "-a",
            account,
            "-w",
        ])
        .output()
        .map_err(|e| format!("执行 security 命令失败: {e}"))?;

    if output.status.success() {
        let password = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if password.is_empty() {
            Ok(None)
        } else {
            Ok(Some(password))
        }
    } else {
        // 检查是否是"密码不存在"的错误
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("could not be found") || stderr.contains("not found") {
            Ok(None)
        } else {
            Err(format!("从 Keychain 读取密码失败: {stderr}"))
        }
    }
}

/// 从 Keychain 删除密码
///
/// # Arguments
/// * `account` - 账户名称
///
/// # Returns
/// * `Ok(())` - 删除成功（或密码不存在）
/// * `Err(String)` - 删除失败，包含错误信息
pub fn delete_password(account: &str) -> Result<(), String> {
    // 使用 security delete-generic-password 命令删除密码
    let output = Command::new("security")
        .args([
            "delete-generic-password",
            "-s",
            SERVICE_NAME,
            "-a",
            account,
        ])
        .output()
        .map_err(|e| format!("执行 security 命令失败: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        // 检查是否是"密码不存在"的错误（这种情况也算成功）
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("could not be found") || stderr.contains("not found") {
            Ok(())
        } else {
            Err(format!("从 Keychain 删除密码失败: {stderr}"))
        }
    }
}

/// 检查 Keychain 是否可用
///
/// # Returns
/// * `true` - Keychain 可用
/// * `false` - Keychain 不可用（如非 macOS 系统）
pub fn is_keychain_available() -> bool {
    // 检查 security 命令是否存在
    Command::new("which")
        .arg("security")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_keychain_available() {
        // 在 macOS 上应该返回 true
        // 注意：这个测试只在 macOS 上有意义
        if cfg!(target_os = "macos") {
            assert!(is_keychain_available());
        }
    }
}

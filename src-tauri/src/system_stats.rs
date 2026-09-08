//! 系统监控：CPU / 内存 / 磁盘 / 网络 IP
//!
//! 每 5 秒由前端 HUD 轮询一次；保持一个 `System` 单例让 `refresh_cpu_usage` 能计算差值。
//! 磁盘使用 macOS 原生 `df -H` 命令（1000 进制，和系统显示一致）。

use std::process::Command;
use std::sync::{Mutex, OnceLock};

use sysinfo::System;

#[derive(serde::Serialize)]
pub struct SystemStats {
    pub cpu: f32,
    pub mem_used_gb: f64,
    pub mem_total_gb: f64,
    pub disk_total_gb: f64,
    pub disk_used_gb: f64,
    pub disk_available_gb: f64,
    pub local_ip: String,
    pub public_ip: String,
    pub network_online: bool,
}

fn system() -> &'static Mutex<System> {
    static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
    SYSTEM.get_or_init(|| Mutex::new(System::new()))
}

/// 公网 IP 缓存（避免每次都请求外部 API）
struct PublicIpCache {
    ip: String,
    timestamp: std::time::Instant,
}

fn public_ip_cache() -> &'static Mutex<Option<PublicIpCache>> {
    static CACHE: OnceLock<Mutex<Option<PublicIpCache>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

/// 本地 IP 缓存（60 秒）
struct LocalIpCache {
    ip: String,
    timestamp: std::time::Instant,
}

fn local_ip_cache() -> &'static Mutex<Option<LocalIpCache>> {
    static CACHE: OnceLock<Mutex<Option<LocalIpCache>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

/// 磁盘信息缓存（10 秒）
struct DiskCache {
    total: f64,
    used: f64,
    available: f64,
    timestamp: std::time::Instant,
}

fn disk_cache() -> &'static Mutex<Option<DiskCache>> {
    static CACHE: OnceLock<Mutex<Option<DiskCache>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

/// 获取本地 IP 地址（通过连接外部地址获取，不实际发送数据），带 60 秒缓存
pub fn get_local_ip() -> String {
    // 检查缓存
    {
        let cache = local_ip_cache().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ref c) = *cache {
            if c.timestamp.elapsed().as_secs() < 60 {
                return c.ip.clone();
            }
        }
    }

    // 获取本地 IP
    let ip = match std::net::UdpSocket::bind("0.0.0.0:0") {
        Ok(socket) => {
            match socket.connect("8.8.8.8:80") {
                Ok(_) => match socket.local_addr() {
                    Ok(addr) => addr.ip().to_string(),
                    Err(_) => String::new(),
                },
                Err(_) => String::new(),
            }
        }
        Err(_) => String::new(),
    };

    // 更新缓存
    let mut cache = local_ip_cache().lock().unwrap_or_else(|e| e.into_inner());
    *cache = Some(LocalIpCache {
        ip: ip.clone(),
        timestamp: std::time::Instant::now(),
    });

    ip
}

/// 获取磁盘使用情况（使用 macOS 原生 df -H 命令，1000 进制，和系统显示一致）
/// 注意：macOS 使用 APFS 容器，系统卷（/）只读且已用空间很小，
/// 用户文件主要存在数据卷（/System/Volumes/Data）上，所以需要获取数据卷的信息。
/// 带 10 秒缓存。
pub fn get_disk_usage() -> (f64, f64, f64) {
    // 检查缓存
    {
        let cache = disk_cache().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ref c) = *cache {
            if c.timestamp.elapsed().as_secs() < 10 {
                return (c.total, c.used, c.available);
            }
        }
    }

    // 先尝试获取数据卷的信息
    let result = get_disk_usage_for_path("/System/Volumes/Data");
    if result.0 > 0.0 {
        // 更新缓存
        let mut cache = disk_cache().lock().unwrap_or_else(|e| e.into_inner());
        *cache = Some(DiskCache {
            total: result.0,
            used: result.1,
            available: result.2,
            timestamp: std::time::Instant::now(),
        });
        return result;
    }
    // 数据卷获取失败，回退到根目录
    let result = get_disk_usage_for_path("/");
    // 更新缓存
    let mut cache = disk_cache().lock().unwrap_or_else(|e| e.into_inner());
    *cache = Some(DiskCache {
        total: result.0,
        used: result.1,
        available: result.2,
        timestamp: std::time::Instant::now(),
    });
    result
}

/// 获取指定路径的磁盘使用情况
fn get_disk_usage_for_path(path: &str) -> (f64, f64, f64) {
    // df -H <path> 输出格式：
    // Filesystem       Size   Used  Avail Capacity iused ifree %iused  Mounted on
    // /dev/disk3s5     494G   461G    34G    94% 4293452 314569   93%   /System/Volumes/Data
    let output = Command::new("df")
        .arg("-H")
        .arg(path)
        .output();

    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let lines: Vec<&str> = stdout.lines().collect();
            if lines.len() >= 2 {
                // 第二行是数据行，按空白分割
                let parts: Vec<&str> = lines[1].split_whitespace().collect();
                if parts.len() >= 4 {
                    // parts[1] = Size, parts[2] = Used, parts[3] = Avail
                    // 格式如 "494G", "461G", "34G"
                    let parse_size = |s: &str| -> f64 {
                        let num: String = s.chars().filter(|c| c.is_ascii_digit() || *c == '.').collect();
                        let unit = s.chars().last().unwrap_or(' ');
                        let value: f64 = num.parse().unwrap_or(0.0);
                        match unit {
                            'K' | 'k' => value / 1000.0 / 1000.0, // KB -> GB
                            'M' | 'm' => value / 1000.0,           // MB -> GB
                            'G' | 'g' => value,                      // GB
                            'T' | 't' => value * 1000.0,            // TB -> GB
                            _ => value / 1000.0 / 1000.0,           // 假设是 KB
                        }
                    };

                    let total = parse_size(parts[1]);
                    let available = parse_size(parts[3]);
                    // 注意：df 返回的 Used 不包含 macOS 可清除空间（purgeable space），
                    // 而系统显示的"已使用"包含了这部分。
                    // 使用 total - available 来计算已使用空间，和系统显示一致。
                    let used = total - available;
                    return (total, used, available);
                }
            }
            (0.0, 0.0, 0.0)
        }
        _ => (0.0, 0.0, 0.0),
    }
}

/// 获取公网 IP 地址（调用外部 API，带缓存，5 分钟刷新一次）
pub async fn get_public_ip() -> (String, bool) {
    // 检查缓存（5 分钟内有效）
    {
        let cache = public_ip_cache().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ref c) = *cache {
            if c.timestamp.elapsed().as_secs() < 300 {
                return (c.ip.clone(), !c.ip.is_empty());
            }
        }
    }

    // 请求外部 API（超时 3 秒）
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build();

    match client {
        Ok(client) => {
            match client.get("https://api.ipify.org").send().await {
                Ok(resp) => match resp.text().await {
                    Ok(text) => {
                        let ip = text.trim().to_string();
                        let online = !ip.is_empty();
                        // 更新缓存
                        let mut cache = public_ip_cache().lock().unwrap_or_else(|e| e.into_inner());
                        *cache = Some(PublicIpCache {
                            ip: ip.clone(),
                            timestamp: std::time::Instant::now(),
                        });
                        (ip, online)
                    }
                    Err(_) => (String::new(), false),
                },
                Err(_) => (String::new(), false),
            }
        }
        Err(_) => (String::new(), false),
    }
}

/// CPU % + memory usage in GB + disk usage in GB + network IP. Polled by the HUD every few seconds;
/// keeping one `System` alive lets `refresh_cpu_usage` compute deltas.
#[tauri::command]
pub async fn system_stats() -> SystemStats {
    let (cpu, mem_used_gb, mem_total_gb, disk_total_gb, disk_used_gb, disk_available_gb) = {
        let mut sys = system().lock().unwrap_or_else(|e| e.into_inner());
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        let gb = 1024.0 * 1024.0 * 1024.0;

        // 使用 macOS 原生 df -H 命令获取磁盘信息（1000 进制，和系统显示一致）
        let (disk_total_gb, disk_used_gb, disk_available_gb) = get_disk_usage();

        (
            sys.global_cpu_usage(),
            sys.used_memory() as f64 / gb,
            sys.total_memory() as f64 / gb,
            disk_total_gb,
            disk_used_gb,
            disk_available_gb,
        )
    };

    // 获取本地 IP（快速，同步）
    let local_ip = get_local_ip();

    // 获取公网 IP（异步，带缓存）
    let (public_ip, network_online) = get_public_ip().await;

    SystemStats {
        cpu,
        mem_used_gb,
        mem_total_gb,
        disk_total_gb,
        disk_used_gb,
        disk_available_gb,
        local_ip,
        public_ip,
        network_online,
    }
}

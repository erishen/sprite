import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** 系统监控数据 */
export interface SystemStats {
  cpu: number;
  mem_used_gb: number;
  mem_total_gb: number;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_available_gb: number;
  local_ip: string;
  public_ip: string;
  network_online: boolean;
}

/** Color code a 0-100% load as a css class. */
export function loadClass(percent: number): string {
  if (percent >= 80) return "load-high";
  if (percent >= 50) return "load-mid";
  return "load-low";
}

/** 系统监控 hook：每 5 秒刷新一次 CPU/内存/硬盘/网络信息 */
export function useSystemStats(): SystemStats | null {
  const [stats, setStats] = useState<SystemStats | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const s = await invoke<SystemStats>("system_stats");
        if (alive) setStats(s);
      } catch (err) {
        console.error("system_stats failed", err);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return stats;
}

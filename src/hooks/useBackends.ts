import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type BackendStatus = boolean | null; // null=检测中, true=在线, false=离线

export interface Backends {
  resolve: BackendStatus;
  spring: BackendStatus;
  harness: BackendStatus;
}

/**
 * 后端健康轮询（5s）：resolve 用 health、spring 用模型列表可达性、harness 用 health。
 * 窗口隐藏（收进托盘）时暂停请求，避免后台持续打后端日志。
 */
export function useBackends(resolveBase: string, springBase: string, harnessBase: string): Backends {
  const [backends, setBackends] = useState<Backends>({
    resolve: null,
    spring: null,
    harness: null,
  });

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const visible = await getCurrentWindow()
        .isVisible()
        .catch(() => true);
      if (!alive || !visible) return;
      const [rh, sh, hh] = await Promise.allSettled([
        invoke<{ ok?: boolean }>("resolve_health", { base: resolveBase }),
        invoke<unknown[]>("spring_models", { base: springBase }),
        invoke<{ ok?: boolean }>("harness_health", { base: harnessBase }),
      ]);
      if (!alive) return;
      setBackends({
        resolve: rh.status === "fulfilled" ? !!rh.value.ok : false,
        spring: sh.status === "fulfilled" && Array.isArray(sh.value) ? true : false,
        harness: hh.status === "fulfilled" ? !!hh.value.ok : false,
      });
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [resolveBase, springBase, harnessBase]);

  return backends;
}

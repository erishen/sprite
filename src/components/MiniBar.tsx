import { useEffect, useState } from "react";
import type { Backends } from "../hooks/useBackends";
import type { PomodoroMode } from "../hooks/usePomodoro";
import type { SystemStats } from "../hooks/useSystemStats";

interface MiniBarProps {
  backends: Backends;
  onOpenPanel: (kind: "resolve" | "spring" | "harness" | "builtin") => void;
  onRestore: () => void;
  onHide: () => void;
  // 番茄钟状态：running 时显示倒计时，未运行时显示秒钟计时
  pomodoroRunning: boolean;
  pomodoroMode: PomodoroMode;
  pomodoroSecondsLeft: number;
  // 内置 LLM 是否配置
  llmConfigured: boolean;
  // 系统监控数据（可选，未获取到时不显示）
  systemStats: SystemStats | null;
  // 自定义应用标题
  appTitle: string;
}

/** 格式化秒数为 MM:SS */
function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** CPU/内存负载颜色 class */
function loadClass(percent: number): string {
  if (percent >= 80) return "load-high";
  if (percent >= 50) return "load-mid";
  return "load-low";
}

/** 最小化横条：系统监控 + 番茄钟倒计时/秒钟计时 + H/S/R/🤖 快捷开窗 + 还原/隐藏。 */
export function MiniBar({
  backends,
  onOpenPanel,
  onRestore,
  onHide,
  pomodoroRunning,
  pomodoroMode,
  pomodoroSecondsLeft,
  llmConfigured,
  systemStats,
  appTitle,
}: MiniBarProps) {
  // 秒钟计时：番茄钟未运行时显示当前时间的秒数
  const [seconds, setSeconds] = useState(() => new Date().getSeconds());

  useEffect(() => {
    if (pomodoroRunning) return; // 番茄钟运行时不需要更新秒数
    const now = new Date();
    const msUntilNextSecond = 1000 - now.getMilliseconds();
    const initialTimeout = window.setTimeout(() => {
      setSeconds(new Date().getSeconds());
      const interval = window.setInterval(() => {
        setSeconds(new Date().getSeconds());
      }, 1000);
      return () => window.clearInterval(interval);
    }, msUntilNextSecond);
    return () => window.clearTimeout(initialTimeout);
  }, [pomodoroRunning]);

  // 计算内存使用率
  const memPct = systemStats
    ? (systemStats.mem_used_gb / systemStats.mem_total_gb) * 100
    : 0;

  // 计算硬盘使用率
  const diskPct = systemStats && systemStats.disk_total_gb > 0
    ? (systemStats.disk_used_gb / systemStats.disk_total_gb) * 100
    : 0;

  return (
    <main className="hud-mini">
      <div className="minibar">
        {/* 自定义应用标题 */}
        <span className="minibar-title">{appTitle || "ESN"}</span>

        {/* 系统监控：CPU + 内存 + 硬盘（有数据时显示，紧凑格式） */}
        {systemStats && (
          <span className="minibar-stats">
            <span className={`minibar-stat ${loadClass(systemStats.cpu)}`} title={`CPU 使用率 ${systemStats.cpu.toFixed(0)}%`}>
              {systemStats.cpu.toFixed(0)}%
            </span>
            <span className={`minibar-stat ${loadClass(memPct)}`} title={`内存 ${systemStats.mem_used_gb.toFixed(1)}/${systemStats.mem_total_gb.toFixed(1)} GB`}>
              {systemStats.mem_used_gb.toFixed(0)}G
            </span>
            <span className={`minibar-stat ${loadClass(diskPct)}`} title={`硬盘 ${systemStats.disk_used_gb.toFixed(0)}/${systemStats.disk_total_gb.toFixed(0)} GB（已用 ${diskPct.toFixed(0)}%）`}>
              {diskPct.toFixed(0)}%
            </span>
          </span>
        )}

        {/* 时间显示：番茄钟运行时显示倒计时，未运行时显示秒钟 */}
        <span className={`minibar-time ${pomodoroRunning ? "pomodoro" : "seconds"}`}>
          {pomodoroRunning ? (
            <>
              <span className="minibar-time-label">{pomodoroMode === "work" ? "专注" : "休息"}</span>
              <span className="minibar-time-value">{formatMMSS(pomodoroSecondsLeft)}</span>
            </>
          ) : (
            <span className="minibar-time-value">{seconds.toString().padStart(2, "0")}s</span>
          )}
        </span>

        <span className="minibar-letters">
          {backends.harness ? (
            <button
              className="letter-btn mini"
              onClick={() => onOpenPanel("harness")}
              title="新开 resolve-harness 聊天窗"
            >
              H
            </button>
          ) : null}
          {backends.spring ? (
            <button
              className="letter-btn mini"
              onClick={() => onOpenPanel("spring")}
              title="新开 spring-harness 聊天窗"
            >
              S
            </button>
          ) : null}
          {backends.resolve ? (
            <button
              className="letter-btn mini"
              onClick={() => onOpenPanel("resolve")}
              title="新开 resolve-studio 聊天窗"
            >
              R
            </button>
          ) : null}
          {llmConfigured ? (
            <button
              className="letter-btn mini"
              onClick={() => onOpenPanel("builtin")}
              title="新开内置 LLM 聊天窗"
            >
              🤖
            </button>
          ) : null}
        </span>
        <span className="minibar-actions">
          <button
            className="icon-btn"
            onClick={onRestore}
            title="还原（Esc）"
          >
            ⤢
          </button>
          <button className="icon-btn" onClick={onHide} title="隐藏到托盘">
            ✕
          </button>
        </span>
      </div>
    </main>
  );
}

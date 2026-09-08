import { useState } from "react";
import type { PomodoroMode } from "../hooks/usePomodoro";

interface PomodoroTimerProps {
  mode: PomodoroMode;
  secondsLeft: number;
  running: boolean;
  completedCount: number;
  totalSeconds: number;
  workMinutes: number;
  breakMinutes: number;
  onToggle: () => void;
  onReset: () => void;
  onSwitchMode: () => void;
  onSetWorkMinutes: (minutes: number) => void;
  onSetBreakMinutes: (minutes: number) => void;
}

/**
 * 番茄钟展示组件：纯展示，状态由 usePomodoro hook 管理（在 App.tsx 中）。
 * 支持自定义时长（工作/休息），设置保存到 localStorage。
 */
export function PomodoroTimer({
  mode,
  secondsLeft,
  running,
  completedCount,
  totalSeconds,
  workMinutes,
  breakMinutes,
  onToggle,
  onReset,
  onSwitchMode,
  onSetWorkMinutes,
  onSetBreakMinutes,
}: PomodoroTimerProps) {
  const [showSettings, setShowSettings] = useState(false);
  const progress = ((totalSeconds - secondsLeft) / totalSeconds) * 100;

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <section className="hud-pomodoro">
      <div className="pomodoro-header">
        <span className={`pomodoro-mode ${mode}`}>
          {mode === "work" ? "保持专注" : "休息一下"}
        </span>
        <span className="pomodoro-count">今日已完成 {completedCount} 个</span>
        <button
          className="pomodoro-settings-btn"
          onClick={() => setShowSettings((s) => !s)}
          title="自定义专注/休息时长"
        >
          时长
        </button>
      </div>

      {showSettings && (
        <div className="pomodoro-settings">
          <div className="pomodoro-setting-row">
            <span className="pomodoro-setting-label">专注时长</span>
            <div className="pomodoro-setting-controls">
              <button
                className="pomodoro-setting-btn"
                onClick={() => onSetWorkMinutes(workMinutes - 5)}
                disabled={workMinutes <= 5}
              >
                -
              </button>
              <span className="pomodoro-setting-value">{workMinutes} 分钟</span>
              <button
                className="pomodoro-setting-btn"
                onClick={() => onSetWorkMinutes(workMinutes + 5)}
                disabled={workMinutes >= 120}
              >
                +
              </button>
            </div>
          </div>
          <div className="pomodoro-setting-row">
            <span className="pomodoro-setting-label">休息时长</span>
            <div className="pomodoro-setting-controls">
              <button
                className="pomodoro-setting-btn"
                onClick={() => onSetBreakMinutes(breakMinutes - 1)}
                disabled={breakMinutes <= 1}
              >
                -
              </button>
              <span className="pomodoro-setting-value">{breakMinutes} 分钟</span>
              <button
                className="pomodoro-setting-btn"
                onClick={() => onSetBreakMinutes(breakMinutes + 1)}
                disabled={breakMinutes >= 60}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pomodoro-timer">
        <div className="pomodoro-time">{formatTime(secondsLeft)}</div>
        <div className="pomodoro-progress-track">
          <div
            className={`pomodoro-progress-fill ${mode}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="pomodoro-controls">
        <button
          className={`pomodoro-btn primary ${running ? "running" : ""}`}
          onClick={onToggle}
          title={running ? "暂停" : "开始"}
        >
          {running ? "⏸ 暂停" : "▶ 开始"}
        </button>
        <button className="pomodoro-btn" onClick={onReset} title="重置">
          ↺ 重置
        </button>
        <button className="pomodoro-btn" onClick={onSwitchMode} title="切换模式">
          {mode === "work" ? "→ 休息" : "→ 专注"}
        </button>
      </div>
    </section>
  );
}

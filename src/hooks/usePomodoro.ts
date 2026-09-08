import { useCallback, useEffect, useRef, useState } from "react";
import { pomodoroReminder, requestNotificationPermission } from "../utils/reminder";

/** 番茄钟状态 */
export type PomodoroMode = "work" | "break";

export interface PomodoroState {
  mode: PomodoroMode;
  secondsLeft: number;
  running: boolean;
  completedCount: number;
}

/** localStorage 键名（新版） */
const STORAGE_KEY = "sprite-pomodoro";
/** 旧版 localStorage 键名（用于数据迁移） */
const OLD_STORAGE_KEY = "desktop-kit-pomodoro";

interface PomodoroSettings {
  workMinutes: number;
  breakMinutes: number;
  completedCount: number;
  lastDate: string; // 日期，用于每日统计重置
}

/** 从 localStorage 读取设置（兼容旧版键名，自动迁移） */
function loadSettings(): PomodoroSettings {
  try {
    // 先尝试新版键名
    let raw = localStorage.getItem(STORAGE_KEY);
    // 如果新版没有，尝试旧版键名并迁移
    if (!raw) {
      raw = localStorage.getItem(OLD_STORAGE_KEY);
      if (raw) {
        // 迁移到新版键名
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(OLD_STORAGE_KEY);
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PomodoroSettings>;
      return {
        workMinutes: parsed.workMinutes ?? 25,
        breakMinutes: parsed.breakMinutes ?? 5,
        completedCount: parsed.completedCount ?? 0,
        lastDate: parsed.lastDate ?? new Date().toDateString(),
      };
    }
  } catch {
    // 忽略读取错误
  }
  return {
    workMinutes: 25,
    breakMinutes: 5,
    completedCount: 0,
    lastDate: new Date().toDateString(),
  };
}

/** 保存设置到 localStorage */
function saveSettings(settings: PomodoroSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 忽略写入错误
  }
}

/**
 * 番茄钟状态管理 hook：状态保存在 hook 中，不随组件卸载而丢失。
 * 时间到后自动提醒（声音 + 系统通知）并自动开始下一阶段。
 * 支持 localStorage 持久化（完成数量、自定义时长）和每日统计重置。
 */
export function usePomodoro() {
  // 从 localStorage 读取初始设置（默认值：工作 25 分钟，休息 5 分钟）
  const [settings, setSettings] = useState<PomodoroSettings>(() => loadSettings());
  const [mode, setMode] = useState<PomodoroMode>("work");
  const [secondsLeft, setSecondsLeft] = useState(settings.workMinutes * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // 标记是否已经请求过通知权限（避免重复请求）
  const permissionRequestedRef = useRef(false);

  const workMinutes = settings.workMinutes;
  const breakMinutes = settings.breakMinutes;
  const completedCount = settings.completedCount;
  const totalSeconds = mode === "work" ? workMinutes * 60 : breakMinutes * 60;

  // 每日统计重置：如果日期变了，重置完成数量
  useEffect(() => {
    const today = new Date().toDateString();
    if (settings.lastDate !== today) {
      setSettings((s) => ({
        ...s,
        completedCount: 0,
        lastDate: today,
      }));
    }
  }, [settings.lastDate]);

  // 保存设置到 localStorage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // 倒计时逻辑
  useEffect(() => {
    if (running && secondsLeft > 0) {
      intervalRef.current = window.setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            // 时间到，切换模式
            const currentMode = modeRef.current;
            const nextMode: PomodoroMode = currentMode === "work" ? "break" : "work";

            // 播放提醒（声音 + 系统通知）
            pomodoroReminder(currentMode);

            // 如果是专注结束，增加完成计数
            if (currentMode === "work") {
              setSettings((s) => ({
                ...s,
                completedCount: s.completedCount + 1,
              }));
            }

            // 切换模式并自动开始下一阶段（不暂停）
            setMode(nextMode);
            setRunning(true); // 自动开始下一阶段
            return nextMode === "work" ? workMinutes * 60 : breakMinutes * 60;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, workMinutes, breakMinutes]);

  // 开始时请求通知权限（只请求一次）
  useEffect(() => {
    if (running && !permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      void requestNotificationPermission();
    }
  }, [running]);

  const toggle = useCallback(() => setRunning((r) => !r), []);

  const reset = useCallback(() => {
    setRunning(false);
    setSecondsLeft(modeRef.current === "work" ? workMinutes * 60 : breakMinutes * 60);
  }, [workMinutes, breakMinutes]);

  const switchMode = useCallback(() => {
    const nextMode: PomodoroMode = modeRef.current === "work" ? "break" : "work";
    setMode(nextMode);
    setRunning(false);
    setSecondsLeft(nextMode === "work" ? workMinutes * 60 : breakMinutes * 60);
  }, [workMinutes, breakMinutes]);

  /** 设置工作时长（分钟） */
  const setWorkMinutes = useCallback((minutes: number) => {
    setSettings((s) => ({ ...s, workMinutes: Math.max(1, Math.min(120, minutes)) }));
    if (modeRef.current === "work") {
      setSecondsLeft(Math.max(1, Math.min(120, minutes)) * 60);
    }
  }, []);

  /** 设置休息时长（分钟） */
  const setBreakMinutes = useCallback((minutes: number) => {
    setSettings((s) => ({ ...s, breakMinutes: Math.max(1, Math.min(60, minutes)) }));
    if (modeRef.current === "break") {
      setSecondsLeft(Math.max(1, Math.min(60, minutes)) * 60);
    }
  }, []);

  return {
    mode,
    secondsLeft,
    running,
    completedCount,
    totalSeconds,
    workMinutes,
    breakMinutes,
    toggle,
    reset,
    switchMode,
    setWorkMinutes,
    setBreakMinutes,
  };
}

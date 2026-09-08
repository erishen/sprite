import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePomodoro } from "../hooks/usePomodoro";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("usePomodoro", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("should initialize with default values", () => {
    const { result } = renderHook(() => usePomodoro());
    expect(result.current.mode).toBe("work");
    expect(result.current.running).toBe(false);
    expect(result.current.completedCount).toBe(0);
    expect(result.current.workMinutes).toBe(25);
    expect(result.current.breakMinutes).toBe(5);
    expect(result.current.secondsLeft).toBe(25 * 60);
  });

  it("should toggle running state", () => {
    const { result } = renderHook(() => usePomodoro());
    expect(result.current.running).toBe(false);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.running).toBe(true);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.running).toBe(false);
  });

  it("should reset timer", () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => {
      result.current.toggle();
    });
    // 等待一段时间让计时器减少
    act(() => {
      result.current.reset();
    });
    expect(result.current.running).toBe(false);
    expect(result.current.secondsLeft).toBe(25 * 60);
  });

  it("should switch mode", () => {
    const { result } = renderHook(() => usePomodoro());
    expect(result.current.mode).toBe("work");
    act(() => {
      result.current.switchMode();
    });
    expect(result.current.mode).toBe("break");
    expect(result.current.secondsLeft).toBe(5 * 60);
  });

  it("should set custom work minutes", () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => {
      result.current.setWorkMinutes(30);
    });
    expect(result.current.workMinutes).toBe(30);
    expect(result.current.secondsLeft).toBe(30 * 60);
  });

  it("should set custom break minutes", () => {
    const { result } = renderHook(() => usePomodoro());
    // 先切换到休息模式
    act(() => {
      result.current.switchMode();
    });
    expect(result.current.mode).toBe("break");
    // 然后设置休息时长
    act(() => {
      result.current.setBreakMinutes(10);
    });
    expect(result.current.breakMinutes).toBe(10);
    expect(result.current.secondsLeft).toBe(10 * 60);
  });

  it("should persist settings to localStorage", () => {
    const { result, unmount } = renderHook(() => usePomodoro());
    act(() => {
      result.current.setWorkMinutes(30);
      result.current.setBreakMinutes(10);
    });
    unmount();

    // 重新挂载，应该从 localStorage 读取设置
    const { result: result2 } = renderHook(() => usePomodoro());
    expect(result2.current.workMinutes).toBe(30);
    expect(result2.current.breakMinutes).toBe(10);
  });
});

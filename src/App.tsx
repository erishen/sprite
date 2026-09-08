import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { useMinimize } from "./useMinimize";
import { openUrl } from "@tauri-apps/plugin-opener";
import publicLaunchers from "./config/launchers.public.json";
import { useBackends } from "./hooks/useBackends";
import { useDebugMode } from "./hooks/useDebugMode";
import { useSettings } from "./hooks/useSettings";
import { mergeConfig } from "./utils/mergedConfig";
import { HudHeader } from "./components/HudHeader";
import { HudLinks } from "./components/HudLinks";
import { CustomItemsQuickAccess } from "./components/CustomItemsQuickAccess";
import { MiniBar } from "./components/MiniBar";
import { PomodoroTimer } from "./components/PomodoroTimer";
import { usePomodoro } from "./hooks/usePomodoro";
import { useSystemStats, loadClass } from "./hooks/useSystemStats";
import { useFlash } from "./hooks/useFlash";
import { useToast } from "./hooks/useToast";
import { ToastContainer } from "./components/Toast";
import { useDragWindow } from "./hooks/useDragWindow";
import { closeCurrentWindow } from "./utils/windowUtils";
import ResolvePanel from "./ResolvePanel";
import SpringPanel from "./SpringPanel";
import HarnessPanel from "./HarnessPanel";
import BuiltinPanel from "./BuiltinPanel";
import SettingsPanel from "./components/SettingsPanel";
import LockScreen from "./components/LockScreen";
import "./App.css";

/** Gap between the screen edge and the widget. */
const SCREEN_MARGIN = 24;

export type Launcher =
  | { kind: "url"; label: string; url: string }
  | { kind: "app"; label: string; app: string }
  | { kind: "bundle"; label: string; bundleId: string }
  | { kind: "script"; label: string; command: string };

// ---- quick-launch shortcuts（JSON 配置） -----------------------------------
// 公开配置：src/config/launchers.public.json（可提交 git，通用快捷方式）
// 本地私密：src/config/launchers.local.json（.gitignore 不提交，个人本地快捷方式）
// kind "url"    -> open a website in the default browser
// kind "app"    -> launch a local application by name (macOS: `open -a <app>`)
// kind "bundle" -> launch by macOS bundle identifier (`open -b <id>`)，精确无歧义
// kind "script" -> run any shell one-liner in the background
// 运行时合并 public + local，local 不存在时自动忽略。

function App() {
  const winLabel = getCurrentWindow().label;

  // 独立小窗：resolve-* / spring-* / harness-* → 聊天窗。
  if (winLabel.startsWith("resolve-")) {
    return <ResolveWindow onClose={() => closeCurrentWindow(winLabel)} />;
  }
  if (winLabel.startsWith("spring-")) {
    return <SpringWindow onClose={() => closeCurrentWindow(winLabel)} />;
  }
  if (winLabel.startsWith("harness-")) {
    return <HarnessWindow onClose={() => closeCurrentWindow(winLabel)} />;
  }
  if (winLabel.startsWith("builtin-")) {
    return <BuiltinWindow onClose={() => closeCurrentWindow(winLabel)} />;
  }
  if (winLabel.startsWith("settings-")) {
    return <SettingsWindow onClose={() => closeCurrentWindow(winLabel)} />;
  }
  return <MainHud />;
}

/** 公共窗口布局：包含 ToastContainer */
function WindowLayout({ children, className }: { children: React.ReactNode; className?: string }) {
  const { toasts, removeToast } = useToast();
  return (
    <main className={className}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </main>
  );
}

/** 独立聊天窗口：只有 ResolvePanel，固定尺寸（Rust 创建窗口时定）。 */
function ResolveWindow({ onClose }: { onClose: () => void }) {
  const appWindow = getCurrentWindow();
  useDragWindow(appWindow);
  return (
    <WindowLayout className="standalone-resolve">
      <ResolvePanel onClose={onClose} />
    </WindowLayout>
  );
}

/** 独立 spring-harness 聊天窗口。 */
function SpringWindow({ onClose }: { onClose: () => void }) {
  const appWindow = getCurrentWindow();
  useDragWindow(appWindow);
  return (
    <WindowLayout className="standalone-resolve">
      <SpringPanel onClose={onClose} />
    </WindowLayout>
  );
}

/** 独立 resolve-harness 聊天窗口。 */
function HarnessWindow({ onClose }: { onClose: () => void }) {
  const appWindow = getCurrentWindow();
  useDragWindow(appWindow);
  return (
    <WindowLayout className="standalone-resolve">
      <HarnessPanel onClose={onClose} />
    </WindowLayout>
  );
}

/** 独立内置 LLM 聊天窗口。 */
function BuiltinWindow({ onClose }: { onClose: () => void }) {
  const appWindow = getCurrentWindow();
  useDragWindow(appWindow);
  return (
    <WindowLayout className="standalone-resolve">
      <BuiltinPanel onClose={onClose} />
    </WindowLayout>
  );
}

/** 独立设置窗口。 */
function SettingsWindow({ onClose }: { onClose: () => void }) {
  return (
    <WindowLayout className="standalone-settings">
      <SettingsPanel onClose={onClose} />
    </WindowLayout>
  );
}

function MainHud() {
  const hudRef = useRef<HTMLElement | null>(null);
  const stats = useSystemStats();
  const appWindow = getCurrentWindow();
  const [flash, notice] = useFlash();
  const { toasts, removeToast } = useToast();
  const anchored = useRef(false);
  const [fullscreen, setFullscreenState] = useState(false);
  const fullscreenRef = useRef(false);
  const resizingRef = useRef(false); // 是否正在调整窗口大小（调整时禁用 3D 倾斜动效）
  const fitRef = useRef<() => void>(() => {});
  const [minimized, toggleMinimize] = useMinimize(appWindow, undefined, 440, "right", 100);
  const { settings, loaded: settingsLoaded } = useSettings();
  const config = mergeConfig(settingsLoaded ? settings : null);
  const backends = useBackends(config.resolveBase, config.springBase, config.harnessBase);
  const pomodoro = usePomodoro();

  // 锁屏状态：如果启用了锁屏功能且设置了密码，初始状态为锁定
  const [locked, setLocked] = useState(() => settings.lockEnabled && settings.lockPassword.length > 0);

  // 监听锁屏事件（来自托盘菜单或其他窗口）
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("lock-screen", () => {
        if (settings.lockEnabled && settings.lockPassword.length > 0) {
          setLocked(true);
        }
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [settings.lockEnabled, settings.lockPassword]);

  // 自动锁定：如果设置了自动锁定时间，检测用户活动
  useEffect(() => {
    if (!settings.lockEnabled || !settings.lockPassword || settings.autoLockMinutes <= 0) return;

    let lastActivity = Date.now();
    const resetActivity = () => {
      lastActivity = Date.now();
    };

    // 监听用户活动
    window.addEventListener("mousemove", resetActivity);
    window.addEventListener("keydown", resetActivity);
    window.addEventListener("click", resetActivity);

    // 每分钟检查一次是否需要自动锁定
    const interval = setInterval(() => {
      const inactiveMinutes = (Date.now() - lastActivity) / 60000;
      if (inactiveMinutes >= settings.autoLockMinutes) {
        setLocked(true);
      }
    }, 60000);

    return () => {
      window.removeEventListener("mousemove", resetActivity);
      window.removeEventListener("keydown", resetActivity);
      window.removeEventListener("click", resetActivity);
      clearInterval(interval);
    };
  }, [settings.lockEnabled, settings.lockPassword, settings.autoLockMinutes]);

  // 解锁处理
  const handleUnlock = () => {
    setLocked(false);
  };
  // 番茄钟模式切换时提示（初始渲染不触发）
  const prevPomodoroMode = useRef(pomodoro.mode);
  useEffect(() => {
    if (prevPomodoroMode.current !== pomodoro.mode) {
      flash(pomodoro.mode === "work" ? "保持专注！" : "休息一下！");
      prevPomodoroMode.current = pomodoro.mode;
    }
  }, [pomodoro.mode, flash]);
  const prevFrame = useRef<{ size: PhysicalSize | null; pos: PhysicalPosition | null }>({
    size: null,
    pos: null,
  });

  // 调试模式：控制是否展示私有配置（launchers.local.json / prompts.local.json）
  const { showPrivate } = useDebugMode();

  // 快捷方式：公开配置（静态 import，HMR 自动刷新）+ 本地私密配置（动态 import，不存在时忽略）
  // 调试模式关闭时，只展示公开配置；调试模式开启时，展示公开配置 + 私有配置
  const [launchers, setLaunchers] = useState<Launcher[]>([]);
  useEffect(() => {
    let alive = true;

    if (!showPrivate) {
      // 只展示公开配置
      if (alive) setLaunchers([...(publicLaunchers as Launcher[])]);
      return;
    }

    // 展示公开配置 + 私有配置
    import("./config/launchers.local.json")
      .then((m) => m.default as Launcher[])
      .catch(() => [] as Launcher[])
      .then((loc) => {
        if (alive) setLaunchers([...(publicLaunchers as Launcher[]), ...loc]);
      });
    return () => {
      alive = false;
    };
  }, [publicLaunchers, showPrivate]);

  const setFs = (v: boolean) => {
    fullscreenRef.current = v;
    setFullscreenState(v);
  };

  // "全屏"实现为铺满当前显示器（setSize+setPosition），而非原生 fullscreen：
  // macOS 原生全屏会独占一个 Space，且全屏+透明是已知黑屏组合（见 README）。
  // 窗口在副屏时铺满副屏：位置取显示器自己的坐标（不能写死主屏原点 0,0）。
  const toggleFullscreen = async () => {
    try {
      if (!fullscreenRef.current) {
        prevFrame.current.size = await appWindow.outerSize();
        prevFrame.current.pos = await appWindow.outerPosition();
        const monitor = await currentMonitor();
        if (!monitor) throw new Error("未找到显示器");
        // 避开 macOS 顶部菜单栏（约 24 逻辑 px），否则窗口头部内容会被菜单栏盖住
        const MENU_BAR_H = 24;
        const w = monitor.size.width / monitor.scaleFactor;
        const h = monitor.size.height / monitor.scaleFactor - MENU_BAR_H;
        const x = monitor.position.x / monitor.scaleFactor;
        const y = monitor.position.y / monitor.scaleFactor + MENU_BAR_H;
        await appWindow.setSize(new LogicalSize(w, h));
        await appWindow.setPosition(new LogicalPosition(x, y));
        setFs(true);
        flash("全屏模式（Esc 或 ⛶ 退出）");
      } else {
        if (prevFrame.current.size) await appWindow.setSize(prevFrame.current.size);
        if (prevFrame.current.pos) await appWindow.setPosition(prevFrame.current.pos);
        setFs(false);
        window.setTimeout(() => fitRef.current(), 200);
        flash("已还原窗口");
      }
    } catch (err) {
      flash(`全屏切换失败: ${String(err)}`);
    }
  };

  // Esc 退出全屏（用 ref 避免重复注册监听）。
  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = toggleFullscreen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreenRef.current) {
        void toggleRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 自实现窗口调整大小（左侧手柄）：不依赖 Tauri 原生 start_resize_dragging（参数格式复杂），
  // 直接用 JS 计算鼠标移动距离，调用 setSize/setPosition 调整窗口大小和位置。
  // 调整大小时临时禁用 3D 倾斜动效，避免叠加抖动。
  useEffect(() => {
    let resizing = false;
    let startX = 0;
    let startWidth = 0;
    let startHeight = 0;
    let startPosX = 0;
    let startPosY = 0;
    let rafId = 0;
    let initialized = false;

    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest("[data-resize-handle]")) return;
      if (e.button !== 0) return;
      if (fullscreenRef.current) return;

      resizing = true;
      initialized = false;
      resizingRef.current = true; // 禁用 3D 倾斜动效
      startX = e.screenX;

      // 获取当前窗口大小和位置（只获取一次）
      void (async () => {
        try {
          const size = await appWindow.outerSize();
          const pos = await appWindow.outerPosition();
          const monitor = await currentMonitor();
          const scale = monitor ? monitor.scaleFactor : 1;
          startWidth = size.width / scale;
          startHeight = size.height / scale;
          startPosX = pos.x / scale;
          startPosY = pos.y / scale;
          initialized = true;
        } catch (err) {
          console.error("获取窗口大小失败", err);
          resizing = false;
          resizingRef.current = false;
        }
      })();

      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!resizing || !initialized) return;
      if (rafId) cancelAnimationFrame(rafId);

      rafId = requestAnimationFrame(() => {
        const deltaX = startX - e.screenX; // 左侧拖动：鼠标向左移动，窗口变宽
        const newWidth = Math.max(340, Math.min(800, startWidth + deltaX));
        const newPosX = startPosX - (newWidth - startWidth); // 左侧拖动：窗口向左扩展，x 位置减小

        // 只调整宽度和 x 位置，保持高度和 y 位置不变（避免传 0 导致 crash）
        void appWindow.setSize(new LogicalSize(newWidth, startHeight)).catch(() => {});
        void appWindow.setPosition(new LogicalPosition(newPosX, startPosY)).catch(() => {});
      });
    };

    const onMouseUp = () => {
      if (!resizing) return;
      resizing = false;
      resizingRef.current = false; // 恢复 3D 倾斜动效
      if (rafId) cancelAnimationFrame(rafId);
      // 调整结束后重新适应高度
      window.setTimeout(() => fitRef.current(), 100);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [appWindow]);

  // 自实现窗口拖拽：不依赖 Tauri 注入的 drag-region 脚本（在部分环境下不可靠）。
  // 在非交互元素上按下左键即调 startDragging 拖动窗口。
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (fullscreenRef.current) return; // 全屏下无窗口可拖
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // 排除交互元素和调整大小手柄
      if (
        t.closest(
          "button, input, textarea, select, a, [role='button'], [contenteditable], [data-resize-handle]"
        )
      )
        return;
      e.preventDefault();
      appWindow
        .startDragging()
        .catch((err) => {
          console.error("startDragging failed", err);
          flash(`拖动失败: ${String(err)}`);
        });
    };

    // 鼠标释放时恢复 3D 倾斜动效（调整大小结束）
    const onMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = false;
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // 窗口高度自动适应内容：只在启动时设置一次初始高度。
  // 宽度不自动调整，由用户手动拉（左侧手柄）。
  // 注意：不使用 ResizeObserver 持续监听，避免引起渲染卡顿和无限循环。
  useLayoutEffect(() => {
    let cancelled = false;

    const adjustHeight = async () => {
      if (cancelled) return;
      if (fullscreenRef.current) return; // 全屏时不调整
      const el = hudRef.current;
      if (!el) return;
      try {
        const currentSize = await appWindow.outerSize();
        const monitor = await currentMonitor();
        const scale = monitor ? monitor.scaleFactor : 1;
        const w = currentSize.width / scale; // 保持当前宽度
        const h = Math.ceil(el.offsetHeight) + 32; // 高度 = 内容高度 + 上下边距（16*2）
        await appWindow.setSize(new LogicalSize(w, h));
        // Anchor top-right once
        if (!anchored.current) {
          if (monitor) {
            const screenW = monitor.size.width / scale;
            await appWindow.setPosition(
              new LogicalPosition(Math.max(screenW - w - SCREEN_MARGIN, 0), SCREEN_MARGIN),
            );
            anchored.current = true;
          }
        }
      } catch (err) {
        console.error("adjust height failed", err);
      }
    };

    // 延迟一点执行初始高度调整，确保内容渲染完成
    const timer = window.setTimeout(adjustHeight, 300);
    fitRef.current = adjustHeight;

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [appWindow]);

  const cpu = stats ? Math.round(stats.cpu) : null;
  const memPct = stats ? Math.round((stats.mem_used_gb / stats.mem_total_gb) * 100) : null;
  const diskPct = stats && stats.disk_total_gb > 0
    ? Math.round((stats.disk_used_gb / stats.disk_total_gb) * 100)
    : null;

  const hide = () => appWindow.hide();

  /** 新建一个小面板窗口（独立聊天窗），由 Rust open_panel 创建。 */
  const openPanel = async (kind: "resolve" | "spring" | "harness" | "builtin") => {
    try {
      await invoke("open_panel", { kind });
      const name = kind === "spring" ? "Spring" : kind === "harness" ? "Harness" : kind === "builtin" ? "内置 LLM" : "聊天";
      flash(`已打开${name}窗口`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[sprite] 开窗失败:", kind, err);
      // 常见错误：达到最大窗口数
      if (msg.includes("MAX_PANELS") || msg.includes("最多") || msg.includes("limit")) {
        flash(`开窗失败: 同类型窗口已达上限（3个）`);
      } else if (msg.length > 60) {
        flash(`开窗失败: ${msg.slice(0, 60)}...`);
      } else {
        flash(`开窗失败: ${msg}`);
      }
    }
  };

  /** 打开设置窗口。 */
  const openSettings = async () => {
    try {
      await invoke("open_settings");
      flash("已打开设置窗口");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[sprite] 打开设置失败:", err);
      flash(`打开设置失败: ${msg}`);
    }
  };

  // Card-level cursor effects: tilt + a light that follows the pointer.
  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = hudRef.current;
    if (!el) return;
    // 调整窗口大小时临时禁用 3D 倾斜动效，避免与大小调整叠加产生抖动感
    if (resizingRef.current) {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      return;
    }
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
    el.style.setProperty("--rx", `${(0.5 - py) * 7}deg`);
    el.style.setProperty("--ry", `${(px - 0.5) * 7}deg`);
  };

  const onMouseLeave = () => {
    const el = hudRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  const run = async (launcher: Launcher) => {
    try {
      if (launcher.kind === "url") {
        await openUrl(launcher.url);
        flash(`已打开 ${launcher.label}`);
      } else if (launcher.kind === "app") {
        await invoke("launch", { kind: "app", target: launcher.app });
        flash(`已启动 ${launcher.label}`);
      } else if (launcher.kind === "bundle") {
        await invoke("launch", { kind: "bundle", target: launcher.bundleId });
        flash(`已启动 ${launcher.label}`);
      } else {
        await invoke("launch", { kind: "script", target: launcher.command });
        flash(`已运行 ${launcher.label}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 提取更友好的错误信息
      let friendlyMsg = msg;
      if (msg.includes("Unable to find application")) {
        friendlyMsg = `未找到应用「${launcher.label}」，请检查是否已安装`;
      } else if (msg.includes("启动应用") || msg.includes("运行脚本")) {
        friendlyMsg = `「${launcher.label}」执行失败: ${msg.replace(/^启动应用「.*?」失败: |^运行脚本失败: /, "")}`;
      } else if (msg.length > 80) {
        friendlyMsg = msg.slice(0, 80) + "...";
      }
      console.error("[sprite] 快捷方式执行失败:", launcher.label, err);
      flash(`操作失败: ${friendlyMsg}`);
    }
  };

  // 如果锁屏启用且已锁定，显示锁屏界面
  if (locked && settings.lockEnabled && settings.lockPassword) {
    return <LockScreen password={settings.lockPassword} appTitle={settings.appTitle} onUnlock={handleUnlock} />;
  }

  return minimized ? (
    <div className="chat-mini-wrapper main-mini-wrapper">
      <MiniBar
        backends={backends}
        onOpenPanel={(k) => void openPanel(k)}
        onRestore={() => void toggleMinimize()}
        onHide={hide}
        pomodoroRunning={pomodoro.running}
        pomodoroMode={pomodoro.mode}
        pomodoroSecondsLeft={pomodoro.secondsLeft}
        llmConfigured={config.llmConfigured}
        systemStats={stats}
        appTitle={settings.appTitle}
      />
    </div>
  ) : (
    <main
      className={`hud ${fullscreen ? "fullscreen" : ""}`}
      ref={hudRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* 拖动 HUD 任意非交互区域即可移动窗口（自实现，见下方 mousedown handler） */}
      <HudHeader
        backends={backends}
        fullscreen={fullscreen}
        statsOk={!!stats}
        llmConfigured={config.llmConfigured}
        appTitle={settings.appTitle}
        clipboardHistoryEnabled={settings.clipboardHistoryEnabled}
        onOpenPanel={(k) => void openPanel(k)}
        onOpenSettings={() => void openSettings()}
        onMinimize={() => void toggleMinimize()}
        onFullscreen={() => void toggleFullscreen()}
        onHide={hide}
      />

      <>
          {settings.pomodoroEnabled && (
            <PomodoroTimer
              mode={pomodoro.mode}
              secondsLeft={pomodoro.secondsLeft}
              running={pomodoro.running}
              completedCount={pomodoro.completedCount}
              totalSeconds={pomodoro.totalSeconds}
              workMinutes={pomodoro.workMinutes}
              breakMinutes={pomodoro.breakMinutes}
              onToggle={pomodoro.toggle}
              onReset={pomodoro.reset}
              onSwitchMode={pomodoro.switchMode}
              onSetWorkMinutes={pomodoro.setWorkMinutes}
              onSetBreakMinutes={pomodoro.setBreakMinutes}
            />
          )}

          {settings.systemMonitorEnabled && (
            <section className="hud-monitor">
            <div className="meter">
              <span className="meter-label">CPU</span>
              <div className="meter-track">
                <div
                  className={`meter-fill ${loadClass(cpu ?? 0)}`}
                  style={{ width: `${cpu ?? 0}%` }}
                />
              </div>
              <span className="meter-value">{cpu === null ? "--" : `${cpu}%`}</span>
            </div>
            <div className="meter">
              <span className="meter-label">MEM</span>
              <div className="meter-track">
                <div
                  className={`meter-fill ${loadClass(memPct ?? 0)}`}
                  style={{ width: `${memPct ?? 0}%` }}
                />
              </div>
              <span className="meter-value">
                {stats ? `${stats.mem_used_gb.toFixed(1)}/${stats.mem_total_gb.toFixed(0)}G` : "--"}
              </span>
            </div>
            <div className="meter">
              <span className="meter-label">DISK</span>
              <div className="meter-track">
                <div
                  className={`meter-fill ${loadClass(diskPct ?? 0)}`}
                  style={{ width: `${diskPct ?? 0}%` }}
                />
              </div>
              <span className="meter-value">
                {stats && stats.disk_total_gb > 0
                  ? `${stats.disk_used_gb.toFixed(1)}/${stats.disk_total_gb.toFixed(1)}G`
                  : "--"}
              </span>
            </div>
            {/* 网络信息：本地 IP + 公网 IP */}
            <div className="network-info">
              <span className="network-item">
                <span className="network-label">LAN</span>
                <span className="network-value">{stats?.local_ip || "--"}</span>
              </span>
              <span className="network-item">
                <span className={`network-dot ${stats?.network_online ? "on" : "off"}`} />
                <span className="network-label">WAN</span>
                <span className="network-value">{stats?.public_ip || "--"}</span>
              </span>
            </div>
          </section>
          )}

          <section className="hud-backends">
            {config.resolveBase && (
              <div className="backend-item">
                <i className={`backend-dot ${backends.resolve ? "on" : backends.resolve === null ? "" : "off"}`} />
                <span>RESOLVE</span>
                <em>{backends.resolve === null ? "检测中" : backends.resolve ? "在线" : "离线"}</em>
              </div>
            )}
            {config.springBase && (
              <div className="backend-item">
                <i className={`backend-dot ${backends.spring ? "on" : backends.spring === null ? "" : "off"}`} />
                <span>SPRING</span>
                <em>{backends.spring === null ? "检测中" : backends.spring ? "在线" : "离线"}</em>
              </div>
            )}
            {config.harnessBase && (
              <div className="backend-item">
                <i className={`backend-dot ${backends.harness ? "on" : backends.harness === null ? "" : "off"}`} />
                <span>HARNESS</span>
                <em>{backends.harness === null ? "检测中" : backends.harness ? "在线" : "离线"}</em>
              </div>
            )}
          </section>

          <HudLinks launchers={launchers} onRun={(l) => void run(l)} />

          {/* 自定义配置（密码箱）快速访问 */}
          <CustomItemsQuickAccess
            masterPasswordEnabled={settings.masterPasswordEnabled}
            masterPassword={settings.masterPassword}
          />
      </>

      {notice && <div className="hud-notice">{notice}</div>}
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* 左侧调整大小手柄（JS 自实现，可靠稳定） */}
      {!fullscreen && (
        <div
          className="resize-handle-left"
          data-resize-handle="true"
          title="拖动调整窗口宽度"
        />
      )}
    </main>
  );
}

export default App;
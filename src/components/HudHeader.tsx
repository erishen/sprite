import { useEffect, useState } from "react";
import type { Backends } from "../hooks/useBackends";
import { ClipboardHistory } from "./ClipboardHistory";

interface HudHeaderProps {
  backends: Backends;
  fullscreen: boolean;
  statsOk: boolean;
  llmConfigured: boolean;
  appTitle: string;
  clipboardHistoryEnabled?: boolean;
  onOpenPanel: (kind: "resolve" | "spring" | "harness" | "builtin") => void;
  onOpenSettings: () => void;
  onMinimize: () => void;
  onFullscreen: () => void;
  onHide: () => void;
}

/** 小秒钟指示器：显示当前时间的秒数，放在 HUD 标题旁边。 */
function SecondsIndicator() {
  const [seconds, setSeconds] = useState(() => new Date().getSeconds());

  useEffect(() => {
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
  }, []);

  return <span className="seconds-indicator">{seconds.toString().padStart(2, "0")}</span>;
}

/** HUD 头部：标题 + 秒钟指示器 + H/S/R 开窗按钮 + 最小化/全屏/关闭。 */
export function HudHeader({
  backends,
  fullscreen,
  statsOk,
  llmConfigured,
  appTitle,
  clipboardHistoryEnabled = true,
  onOpenPanel,
  onOpenSettings,
  onMinimize,
  onFullscreen,
  onHide,
}: HudHeaderProps) {
  return (
    <header className="hud-header">
      <span className="hud-title">
        <span className={`status-dot ${statsOk ? "status-ok" : ""}`} />
        {appTitle || "ESN"}
        <SecondsIndicator />
      </span>
      <div className="hud-actions">
        {backends.harness ? (
          <button
            className="letter-btn"
            onClick={() => onOpenPanel("harness")}
            title="新开 resolve-harness 聊天窗"
          >
            H
          </button>
        ) : null}
        {backends.spring ? (
          <button
            className="letter-btn"
            onClick={() => onOpenPanel("spring")}
            title="新开 spring-harness 聊天窗"
          >
            S
          </button>
        ) : null}
        {backends.resolve ? (
          <button
            className="letter-btn"
            onClick={() => onOpenPanel("resolve")}
            title="新开 resolve-studio 聊天窗"
          >
            R
          </button>
        ) : null}
        {llmConfigured ? (
          <button
            className="letter-btn"
            onClick={() => onOpenPanel("builtin")}
            title="新开内置 LLM 聊天窗（OpenAI 兼容 API）"
          >
            🤖
          </button>
        ) : null}
        <ClipboardHistory enabled={clipboardHistoryEnabled} />
        <button
          className="icon-btn settings-btn"
          onClick={onOpenSettings}
          title="设置（配置 AI 后端和内置 LLM）"
        >
          ⚙
        </button>
        <button
          className="icon-btn"
          onClick={onMinimize}
          title="最小化到顶部（Esc 还原）"
        >
          ─
        </button>
        <button
          className={`icon-btn ${fullscreen ? "active" : ""}`}
          onClick={onFullscreen}
          title={fullscreen ? "还原窗口" : "全屏"}
        >
          ⛶
        </button>
        <button className="icon-btn" onClick={onHide} title="隐藏到托盘">
          ✕
        </button>
      </div>
    </header>
  );
}

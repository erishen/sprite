import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useFullscreen } from "./useFullscreen";
import { useMinimize } from "./useMinimize";
import { renderRich } from "./components/RichText";
import { ChatHeader } from "./components/ChatHeader";
import { ChatInput } from "./components/ChatInput";
import { ChatMiniBar } from "./components/ChatMiniBar";
import { ExampleChips, type PanelExample } from "./components/ExampleChips";
import { copyText, scrollToBottom } from "./utils/chatUtils";
import { exportChatMessages, type ChatMessage } from "./utils/chatExport";
import { usePrompts } from "./hooks/usePrompts";
import { useHistory } from "./hooks/useHistory";
import { useSettings } from "./hooks/useSettings";
import { mergeConfig } from "./utils/mergedConfig";

interface BuiltinTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  done: boolean;
}

type BuiltinEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** 静态示例问题（内置 LLM 没有后端示例 API）。引导用户问操作系统、应用程序、桌面效率相关问题。 */
const EXAMPLES: PanelExample[] = [
  { text: "macOS 如何强制退出无响应的应用？有哪些快捷键？" },
  { text: "如何查看 Mac 的 CPU/内存占用并找出耗电的进程？" },
  { text: "macOS 截图有哪些方式？如何截指定窗口或区域？" },
  { text: "如何清理 Mac 磁盘空间？有哪些常见的可清理文件？" },
  { text: "如何设置 Mac 开机启动项，禁用不需要的自启动应用？" },
  { text: "macOS 如何快速切换应用和窗口？有哪些实用快捷键？" },
  { text: "如何在 Mac 上隐藏 Dock 或菜单栏，获得更大工作区？" },
  { text: "Mac 睡眠后唤醒很慢或网络断连，怎么排查和解决？" },
  { text: "如何用终端查看文件大小并找出占用空间最大的文件夹？" },
  { text: "macOS 通知太烦人，如何按应用管理或专注模式屏蔽？" },
];

/** 空态/回答后各展示几个示例问题。 */
const SUGGEST_COUNT = 3;

function suggestFor(turnIdx: number): PanelExample[] {
  // 简单轮换：根据轮次取不同的示例子集
  const start = (turnIdx * SUGGEST_COUNT) % EXAMPLES.length;
  const result: PanelExample[] = [];
  for (let i = 0; i < SUGGEST_COUNT; i++) {
    result.push(EXAMPLES[(start + i) % EXAMPLES.length]);
  }
  return result;
}

/** 内置 LLM 聊天窗（直接调用 OpenAI 兼容 API，SSE 流式）。 */
export default function BuiltinPanel({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<BuiltinTurn[]>([]);
  // 内置 LLM 窗口：保留历史记录自动加载，用户可以通过 🗑 按钮手动清空
  useHistory(getCurrentWindow().label, turns, setTurns, false);
  const [copied, setCopied] = useState<string | null>(null);
  const prompts = usePrompts();
  const { settings, loaded: settingsLoaded } = useSettings();
  const config = mergeConfig(settingsLoaded ? settings : null);

  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const turnSeq = useRef(0);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const stickBottom = useRef(true);
  const copiedTimer = useRef<number | null>(null);
  const appWindow = getCurrentWindow();
  const [fullscreen, toggleFullscreen] = useFullscreen(appWindow);
  const [minimized, toggleMinimize] = useMinimize(appWindow, undefined, undefined, "left");

  const nextTurnId = () => `bt${++turnSeq.current}`;

  const patchTurn = (id: string, patch: Partial<BuiltinTurn>) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  /** 追加文本到指定 turn（函数式更新，避免流式 delta 竞态条件导致内容丢失/混乱） */
  const appendToTurn = (id: string, text: string) =>
    setTurns((ts) =>
      ts.map((t) => (t.id === id ? { ...t, text: t.text + text } : t)),
    );

  const finishTurn = (id: string) => patchTurn(id, { done: true });

  const doCopy = async (key: string, text: string) => {
    const ok = await copyText(text);
    setCopied(ok ? key : null);
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1800);
  };

  /** 发送问题。 */
  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || running) return;
    setInput("");
    setError(null);
    const userTurn: BuiltinTurn = { id: nextTurnId(), role: "user", text: q, done: true };
    const aiTurn: BuiltinTurn = { id: nextTurnId(), role: "assistant", text: "", done: false };
    setTurns((ts) => [...ts, userTurn, aiTurn]);
    setRunning(true);

    const channel = new Channel<BuiltinEvent>();
    channel.onmessage = (ev) => {
      switch (ev.type) {
        case "delta":
          // 使用函数式更新追加文本，避免流式 delta 竞态条件导致内容丢失/混乱
          appendToTurn(aiTurn.id, ev.text);
          break;
        case "done":
          finishTurn(aiTurn.id);
          setRunning(false);
          break;
        case "error":
          setError(ev.message);
          finishTurn(aiTurn.id);
          setRunning(false);
          break;
      }
    };

    // 构建历史对话（只包含已完成的对话，用于多轮对话上下文）
    const history = turnsRef.current
      .filter((t) => t.done && t.text)
      .map((t) => ({
        role: t.role === "user" ? "user" : "assistant",
        content: t.text,
      }));

    try {
      await invoke("builtin_chat", {
        question: q,
        apiKey: config.builtinApiKey,
        baseUrl: config.builtinBase,
        model: config.builtinModel,
        history,
        onEvent: channel,
      });
    } catch (e) {
      setError(String(e));
      finishTurn(aiTurn.id);
      setRunning(false);
    }
  };

  /** 停止生成。 */
  const stop = () => {
    invoke("builtin_chat_abort", { win: getCurrentWindow().label }).catch((e) => console.error("[sprite] 停止失败:", e));
    setRunning(false);
    // 标记当前未完成的 turn 为 done
    setTurns((ts) => ts.map((t) => (t.role === "assistant" && !t.done ? { ...t, done: true } : t)));
  };

  /** 清空当前对话历史。 */
  const clearHistory = () => {
    if (running) {
      // 如果正在生成，先停止
      stop();
    }
    setTurns([]);
    setError(null);
    // 保存空历史会自动删除历史文件（save_history 中 json == "[]" 时删除文件）
    invoke("save_history", { label: getCurrentWindow().label, json: "[]" }).catch((e) =>
      console.error("[sprite] 清空历史失败:", e),
    );
  };

  /** 导出聊天记录为 Markdown */
  const handleExport = async () => {
    if (turns.length === 0) {
      console.log("[sprite] 没有聊天记录可导出");
      return;
    }
    const messages: ChatMessage[] = turns
      .filter((t) => t.text && t.text.trim())
      .map((t) => ({
        role: t.role,
        content: t.text,
      }));
    await exportChatMessages(messages, "markdown", `内置 LLM 聊天记录`);
  };

  // 自动滚动到底部
  useEffect(() => {
    scrollToBottom(logRef.current, stickBottom);
  }, [turns]);

  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <section className="resolve-panel">
      {minimized ? (
        <ChatMiniBar
          title={`内置 LLM · ${config.builtinModel || "未配置"}`}
          onRestore={() => void toggleMinimize()}
          onClose={onClose}
        />
      ) : (
        <>
      <ChatHeader
        title={`内置 LLM · ${config.builtinModel || "未配置"}`}
        statusOk={!!config.builtinApiKey}
        fullscreen={fullscreen}
        onOpenSame={() => void invoke("open_panel", { kind: "builtin" })}
        onMinimize={() => void toggleMinimize()}
        onFullscreen={() => void toggleFullscreen()}
        onClose={onClose}
        onClear={clearHistory}
        onExport={handleExport}
      />

      <div className="resolve-log" ref={logRef} onScroll={onScroll}>
        {turns.length === 0 && (
          <div className="resolve-empty">
            <div>
              直接调用 OpenAI 兼容 API（{config.builtinBase || "未配置"}，模型 {config.builtinModel || "未配置"}），无需启动后端。
              {!config.builtinApiKey && <span style={{ color: "#ea6668" }}> 未配置 API Key，请在设置中配置。</span>}
            </div>
            <ExampleChips examples={suggestFor(0)} onSelect={(t) => void send(t)} />
          </div>
        )}

        {turns.map((t, turnIdx) =>
          t.role === "user" ? (
            <div key={t.id} className="resolve-turn resolve-user-turn">
              <div className="resolve-role">你</div>
              <div className="msg-body">{renderRich(t.text)}</div>
            </div>
          ) : (
            <div key={t.id} className="resolve-turn">
              <div className="resolve-role">
                AI
                {!t.done && <span className="cursor" />}
              </div>
              <div className="msg-body">
                {t.text ? renderRich(t.text) : !t.done ? <span className="cursor" /> : null}
              </div>
              {t.done && t.text && (
                <div className="resolve-actions">
                  <button className="mini-btn" onClick={() => void doCopy(t.id, t.text)}>
                    {copied === t.id ? "已复制" : "复制"}
                  </button>
                </div>
              )}
              {t.done && t.text && (
                <ExampleChips
                  variant="followup"
                  examples={suggestFor(turnIdx)}
                  onSelect={(t2) => void send(t2)}
                />
              )}
            </div>
          ),
        )}

        {error && (
          <div className="resolve-error">
            <pre>{error}</pre>
            <button className="mini-btn" onClick={() => void doCopy("err", error)}>
              {copied === "err" ? "已复制" : "复制"}
            </button>
          </div>
        )}
      </div>

      <ChatInput
        input={input}
        running={running}
        placeholder={running ? "生成中…（点击停止）" : "问内置 LLM…（Enter 发送，Shift+Enter 换行）"}
        inputRef={inputRef}
        onChange={setInput}
        onSend={() => void send()}
        onStop={stop}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (running) stop();
            else void send();
          }
        }}
        prompts={prompts}
        onSelectPrompt={(p) => setInput(p.text)}
      />
        </>
      )}
    </section>
  );
}

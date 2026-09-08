import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useFullscreen } from "./useFullscreen";
import { useMinimize } from "./useMinimize";
import { CollapsiblePre, renderRich } from "./components/RichText";
import { ChatHeader } from "./components/ChatHeader";
import { ChatInput } from "./components/ChatInput";
import { ChatMiniBar } from "./components/ChatMiniBar";
import { ExampleChips, type PanelExample } from "./components/ExampleChips";
import { copyText } from "./utils/chatUtils";
import { exportChatMessages, type ChatMessage } from "./utils/chatExport";
import { usePrompts } from "./hooks/usePrompts";
import { useHistory } from "./hooks/useHistory";

/** 后端地址与模型：优先 .env（VITE_SPRING_*），否则默认本机。 */
const SPRING_BASE: string = import.meta.env.VITE_SPRING_BASE_URL || "http://127.0.0.1:8080";
const SPRING_MODEL: string = import.meta.env.VITE_SPRING_MODEL || "agnes-2.0-flash";

interface SpringTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking: string;
  tools: { name: string; detail: string }[];
  done: boolean;
}

interface SpringModel {
  id: string;
  vendor?: string;
  description?: string;
  enabled?: boolean;
}

type SpringEvent =
  | { type: "thinking"; text: string }
  | { type: "tool"; call: unknown }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/* ---- 建议示例（后端 /api/examples 动态下发） ---- */

/** 空态/回答后各展示几个示例问题。 */
const SUGGEST_COUNT = 3;

/** spring-harness ReAct Agent 聊天窗（SSE：thinking → tool → answer → done）。 */
export default function SpringPanel({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<SpringTurn[]>([]);
  useHistory(getCurrentWindow().label, turns, setTurns, false);
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedThink, setExpandedThink] = useState<Set<string>>(new Set());
  const [models, setModels] = useState<SpringModel[]>([]);
  const [model, setModel] = useState<string>(SPRING_MODEL);
  const [info, setInfo] = useState<{
    tools?: number;
    mcp?: number;
    knowledge?: number;
    models?: number;
    uptimeSecs?: number;
  } | null>(null);
  const [examples, setExamples] = useState<PanelExample[]>([]);
  const prompts = usePrompts();
  const fmtUptime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h${m}m` : `${m}m`;
  };

  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const stopRef = useRef(false);
  const turnSeq = useRef(0);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const stickBottom = useRef(true);
  const copiedTimer = useRef<number | null>(null);
  const win = getCurrentWindow().label;
  const appWindow = getCurrentWindow();
  const [fullscreen, toggleFullscreen] = useFullscreen(appWindow);
  const [minimized, toggleMinimize] = useMinimize(appWindow, undefined, undefined, "left");

  const nextTurnId = () => `st${++turnSeq.current}`;

  const patchTurn = (id: string, patch: Partial<SpringTurn>) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  /** 追加文本到指定 turn 的 text 字段（函数式更新，避免流式 delta 竞态条件） */
  const appendToTurn = (id: string, text: string) =>
    setTurns((ts) =>
      ts.map((t) => (t.id === id ? { ...t, text: t.text + text } : t)),
    );

  /** 追加文本到指定 turn 的 thinking 字段（函数式更新，避免流式竞态条件） */
  const appendThinkingToTurn = (id: string, text: string) =>
    setTurns((ts) =>
      ts.map((t) => (t.id === id ? { ...t, thinking: (t.thinking ?? "") + text } : t)),
    );

  const finishTurn = (id: string) => patchTurn(id, { done: true });

  const doCopy = async (key: string, text: string) => {
    const ok = await copyText(text);
    setCopied(ok ? key : null);
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1800);
  };

  const toggleThink = (id: string) =>
    setExpandedThink((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** 统一处理 SSE 事件。 */
  const handleEvent = (ev: SpringEvent, turnId: string) => {
    const cur = () => turnsRef.current.find((t) => t.id === turnId);
    switch (ev.type) {
      case "thinking":
        // 使用函数式更新追加思考内容，避免流式竞态条件
        appendThinkingToTurn(turnId, ev.text);
        break;
      case "tool": {
        const call = ev.call as Record<string, unknown> | string;
        let name = "工具";
        let detail = "";
        if (typeof call === "string") {
          detail = call;
        } else {
          name = String(call.name ?? call.tool ?? "工具");
          detail = JSON.stringify(call.arguments ?? call.input ?? call, null, 2);
        }
        const t = cur();
        if (t) patchTurn(turnId, { tools: [...t.tools, { name, detail }] });
        break;
      }
      case "delta":
        // 使用函数式更新追加文本，避免流式 delta 竞态条件导致内容丢失/混乱
        appendToTurn(turnId, ev.text);
        break;
      case "done":
        finishTurn(turnId);
        setRunning(false);
        break;
      case "error":
        setError(ev.message);
        finishTurn(turnId);
        setRunning(false);
        break;
    }
  };

  /** 发送一条消息（ReAct 流式）。 */
  /** 拉取后端示例问题（空态建议 + 回答后 follow-up）。 */
  useEffect(() => {
    let alive = true;
    invoke<PanelExample[]>("fetch_examples", { base: SPRING_BASE, token: "", mode: "agent" })
      .then((exs) => {
        if (alive && Array.isArray(exs) && exs.length > 0) {
          const list = exs.filter((e) => e && e.text && e.text.trim());
          // 每次打开随机洗牌，示例顺序与组合不同
          for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
          }
          setExamples(list);
        }
      })
      .catch((e) => console.error("[sprite] 操作失败:", e));
    return () => {
      alive = false;
    };
  }, []);

  /** 按轮次偏移取几个示例（follow-up 轮换，避免重复）。 */
  const suggestFor = (round: number) => {
    if (examples.length === 0) return [];
    const out: PanelExample[] = [];
    for (let i = 0; i < SUGGEST_COUNT && out.length < SUGGEST_COUNT; i++) {
      out.push(examples[(round + i) % examples.length]);
    }
    return out;
  };

  const send = async (text?: string) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || running) return;
    setInput("");
    stopRef.current = false;
    setError(null);
    const userTurn: SpringTurn = { id: nextTurnId(), role: "user", text: trimmed, thinking: "", tools: [], done: true };
    const asTurn: SpringTurn = { id: nextTurnId(), role: "assistant", text: "", thinking: "", tools: [], done: false };
    setTurns((ts) => [...ts, userTurn, asTurn]);
    setRunning(true);
    const ch = new Channel<SpringEvent>();
    ch.onmessage = (ev) => handleEvent(ev, asTurn.id);
    try {
      await invoke("spring_chat", {
        win,
        base: SPRING_BASE,
        message: trimmed,
        model,
        onEvent: ch,
      });
    } catch (e) {
      if (!stopRef.current) {
        setError(String(e));
        finishTurn(asTurn.id);
      }
      setRunning(false);
    }
  };

  /** 停止：中断当前请求（与 resolve 共用按窗口隔离的 abort）。 */
  const stop = () => {
    stopRef.current = true;
    void invoke("resolve_chat_abort", { win }).catch((e) => console.error("[sprite] 操作失败:", e));
    setRunning(false);
    setTurns((ts) => ts.map((t) => (!t.done ? { ...t, done: true } : t)));
  };

  /** 清空当前对话历史。 */
  const clearHistory = () => {
    if (running) {
      stop();
    }
    setTurns([]);
    setError(null);
    invoke("save_history", { label: win, json: "[]" }).catch((e) =>
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
    await exportChatMessages(messages, "markdown", `Spring Harness 聊天记录`);
  };

  // 自动滚动
  useEffect(() => {
    const el = logRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [turns, error]);

  // 拉取可用模型（enabled 项），默认选 .env 配置的模型
  useEffect(() => {
    let alive = true;
    invoke<SpringModel[]>("spring_models", { base: SPRING_BASE })
      .then((ms) => {
        if (!alive) return;
        const usable = ms.filter((m) => m.enabled !== false && m.id);
        setModels(usable);
        const hasDefault = usable.some((m) => m.id === SPRING_MODEL);
        if (!hasDefault && usable.length > 0) setModel(usable[0].id);
      })
      .catch(() => {
        /* 拉取失败就只用 .env 默认模型 */
      });
    invoke<{ tools?: number; mcp?: number; knowledge?: number; models?: number; uptimeSecs?: number }>("spring_info", { base: SPRING_BASE })
      .then((v) => alive && setInfo(v))
      .catch((e) => console.error("[sprite] 操作失败:", e));
    return () => {
      alive = false;
    };
  }, []);
  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // Enter 发送 / Shift+Enter 换行
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    };
    ta.addEventListener("keydown", onKey);
    return () => ta.removeEventListener("keydown", onKey);
  });

  return (
    <section className="resolve-panel">
      {minimized ? (
        <ChatMiniBar
          title="Spring Harness"
          onRestore={() => void toggleMinimize()}
          onClose={onClose}
        />
      ) : (
        <>
      <ChatHeader
        title="Spring Harness"
        statusOk={!!info}
        fullscreen={fullscreen}
        onOpenSame={() => void invoke("open_panel", { kind: getCurrentWindow().label.split("-")[0] })}
        onMinimize={() => void toggleMinimize()}
        onFullscreen={() => void toggleFullscreen()}
        onClose={onClose}
        onClear={clearHistory}
        onExport={handleExport}
      >
        <select
          className="spring-model-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          title="选择模型"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </select>
      </ChatHeader>

      {info && (
        <div className="spring-info">
          <span>{info.tools ?? 0} 工具</span>
          <i />
          <span>{info.mcp ?? 0} MCP</span>
          <i />
          <span>{info.knowledge ?? 0} 知识</span>
          <i />
          <span>模型 {info.models ?? 0}</span>
          {typeof info.uptimeSecs === "number" && (
            <>
              <i />
              <span>运行 {fmtUptime(info.uptimeSecs)}</span>
            </>
          )}
        </div>
      )}

      <div className="resolve-log" ref={logRef} onScroll={onScroll}>
        {turns.length === 0 && !error && (
          <div className="resolve-empty">
            ReAct Agent（思考 → 工具 → 回答），模型 {SPRING_MODEL}。点击示例或直接提问：
            <ExampleChips examples={suggestFor(0) as PanelExample[]} onSelect={(t) => void send(t)} />
          </div>
        )}

        {turns.map((t, turnIdx) =>
          t.role === "user" ? (
            <div key={t.id} className="msg msg-user">
              <div className="msg-head">
                <span>{t.text}</span>
              </div>
            </div>
          ) : (
            <div key={t.id} className="msg msg-agent">
              <div className="agent-label">
                <span className="agent-dot" />
                Spring
                {t.thinking && (
                  <button
                    className="mini-btn"
                    onClick={() => toggleThink(t.id)}
                  >
                    {expandedThink.has(t.id) || !t.done ? "收起思考" : `思考（${t.thinking.length} 字）`}
                  </button>
                )}
                {t.tools.length > 0 && <span className="tool-count">工具 ×{t.tools.length}</span>}
                {t.done && t.text && (
                  <button
                    className="copy-btn"
                    onClick={() => void doCopy(`a-${t.id}`, t.text)}
                  >
                    {copied === `a-${t.id}` ? "已复制" : "复制"}
                  </button>
                )}
              </div>

              {t.thinking && (expandedThink.has(t.id) || !t.done) && (
                <div className="msg-reasoning">
                  <div>{renderRich(t.thinking)}</div>
                </div>
              )}

              {t.tools.map((tool, i) => (
                <div key={i} className="tool-wrap">
                  <div className="tool-card">
                    <div className="tool-head">
                      <span className="tool-icon ok">⚙</span>
                      <span className="tool-name">{tool.name}</span>
                    </div>
                    {tool.detail && <CollapsiblePre text={tool.detail} maxLines={6} />}
                  </div>
                </div>
              ))}

              <div className="msg-body">
                {t.text ? (
                  renderRich(t.text)
                ) : !t.done ? (
                  <span className="cursor" />
                ) : null}
              </div>

              {t.done && t.text && examples.length > 0 && (
                <ExampleChips
                  variant="followup"
                  examples={suggestFor(turnIdx) as PanelExample[]}
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
        placeholder={running ? "Agent 运行中…（Enter 停止）" : "问 Spring Harness…（Enter 发送，Shift+Enter 换行）"}
        inputRef={inputRef}
        onChange={setInput}
        onSend={() => void send()}
        onStop={stop}
        prompts={prompts}
        onSelectPrompt={(p) => setInput(p.text)}
      />
        </>
      )}
    </section>
  );
}

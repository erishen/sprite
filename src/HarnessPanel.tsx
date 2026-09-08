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

/** 后端地址 / 鉴权 Token / 模型：优先 .env（VITE_HARNESS_*），否则默认本机。 */
const HARNESS_BASE: string = import.meta.env.VITE_HARNESS_BASE_URL || "http://127.0.0.1:8899";
const HARNESS_TOKEN: string = import.meta.env.VITE_HARNESS_API_TOKEN || "";
const HARNESS_MODEL: string = import.meta.env.VITE_HARNESS_MODEL || "openai/agnes-2.0-flash";

interface HarnessTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: {
    name: string;
    detail: string;
    kind: "call" | "result";
    callId?: string;
    threadId?: string;
    awaitingApproval?: boolean;
    approvalStatus?: "pending" | "approved" | "denied";
    approving?: boolean;
  }[];
  done: boolean;
}

interface HarnessModel {
  id: string;
  model?: string;
  baseUrl?: string;
}

interface HarnessExample {
  label?: string;
  text: string;
  source?: string;
}

type HarnessEvent =
  | { type: "tool"; call: unknown }
  | { type: "toolResult"; call: unknown }
  | { type: "text"; text: string }
  | { type: "approvalRequest"; threadId: string; callId: string; toolName: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** 空态/回答后各展示几个示例问题。 */
const SUGGEST_COUNT = 3;

/** resolve-harness 聊天窗（同步 /api/chat：一次返回 reply + trace 工具过程）。 */
export default function HarnessPanel({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<HarnessTurn[]>([]);
  useHistory(getCurrentWindow().label, turns, setTurns, false);
  const [copied, setCopied] = useState<string | null>(null);
  const [models, setModels] = useState<HarnessModel[]>([]);
  const [model, setModel] = useState<string>(HARNESS_MODEL);
  const [examples, setExamples] = useState<HarnessExample[]>([]);
  const prompts = usePrompts();

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

  const nextTurnId = () => `ht${++turnSeq.current}`;

  const patchTurn = (id: string, patch: Partial<HarnessTurn>) =>
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

  /** 统一处理事件。 */
  const handleEvent = (ev: HarnessEvent, turnId: string) => {
    const cur = () => turnsRef.current.find((t) => t.id === turnId);
    switch (ev.type) {
      case "tool": {
        const call = ev.call as Record<string, unknown>;
        const t = cur();
        if (!t) break;
        const name = String(call.name ?? "工具");
        const detail = JSON.stringify(call.args ?? call, null, 2);
        const callId = String(call.callId ?? call.call_id ?? "");
        patchTurn(turnId, { tools: [...t.tools, { name, detail, kind: "call", callId }] });
        break;
      }
      case "toolResult": {
        const call = ev.call as Record<string, unknown>;
        const t = cur();
        if (!t) break;
        const name = String(call.name ?? "工具结果");
        const content = call.content;
        const detail =
          typeof content === "string"
            ? content
            : JSON.stringify(content ?? call, null, 2);
        patchTurn(turnId, { tools: [...t.tools, { name, detail, kind: "result" }] });
        break;
      }
      case "approvalRequest": {
        const t = cur();
        if (!t) {
          console.error("[sprite] 未找到当前 turn，turnId=", turnId);
          break;
        }
        // 把对应的工具调用标记为等待审批
        const updatedTools = t.tools.map((tool) => {
          if (tool.callId && tool.callId === ev.callId) {
            return { ...tool, awaitingApproval: true, threadId: ev.threadId };
          }
          return tool;
        });
        // 如果没找到对应的工具，就追加一个
        if (!updatedTools.some((tool) => tool.callId === ev.callId)) {
          updatedTools.push({
            name: ev.toolName,
            detail: "等待人工审批…",
            kind: "call" as const,
            callId: ev.callId,
            threadId: ev.threadId,
            awaitingApproval: true,
          });
        }
        patchTurn(turnId, { tools: updatedTools });
        break;
      }
      case "text":
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

  /** 发送一条消息（同步接口：完成后一次性推回复）。 */
  const send = async (text?: string) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || running) return;
    setInput("");
    stopRef.current = false;
    setError(null);
    const userTurn: HarnessTurn = { id: nextTurnId(), role: "user", text: trimmed, tools: [], done: true };
    const asTurn: HarnessTurn = { id: nextTurnId(), role: "assistant", text: "", tools: [], done: false };
    setTurns((ts) => [...ts, userTurn, asTurn]);
    setRunning(true);
    const ch = new Channel<HarnessEvent>();
    ch.onmessage = (ev) => handleEvent(ev, asTurn.id);
    try {
      await invoke("harness_chat", {
        win,
        base: HARNESS_BASE,
        token: HARNESS_TOKEN,
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

  /** 停止：中断当前请求（按窗口隔离的 abort）。 */
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
    await exportChatMessages(messages, "markdown", `Resolve Harness 聊天记录`);
  };

  /** 批准 / 拒绝一个 pending 工具调用。 */
  const decide = async (threadId: string, callId: string, decision: "approve" | "deny") => {
    if (!callId) {
      console.error("[sprite] 审批失败：缺少 callId");
      setError("审批失败：缺少 callId");
      return;
    }
    if (!threadId) {
      console.error("[sprite] 审批失败：缺少 threadId");
      setError("审批失败：缺少 threadId");
      return;
    }
    // 防止重复点击：先标记为审批中
    setTurns((ts) =>
      ts.map((t) => ({
        ...t,
        tools: t.tools.map((tool) =>
          tool.callId === callId ? { ...tool, approving: true } : tool,
        ),
      })),
    );
    try {
      // 找到当前未完成的 turn（审批后的响应会追加到当前 turn）
      let targetTurnId: string | null = null;
      const pendingTurn = turnsRef.current.find((t) => !t.done);
      if (pendingTurn) {
        targetTurnId = pendingTurn.id;
      } else {
        console.warn("[sprite] 未找到未完成的 turn，创建新的 assistant turn");
        // 如果没有未完成的 turn，创建一个新的 assistant turn 来接收审批后的响应
        const newTurn: HarnessTurn = {
          id: nextTurnId(),
          role: "assistant",
          text: "",
          tools: [],
          done: false,
        };
        setTurns((ts) => [...ts, newTurn]);
        targetTurnId = newTurn.id;
      }

      // 创建新的 Channel 来接收审批后的响应
      const ch = new Channel<HarnessEvent>();
      ch.onmessage = (ev) => {
        if (targetTurnId) {
          handleEvent(ev, targetTurnId);
        } else {
          console.error("[sprite] 没有 targetTurnId，无法处理事件");
        }
      };

      await invoke("harness_approve", {
        base: HARNESS_BASE,
        token: HARNESS_TOKEN,
        threadId,
        callId,
        decision,
        onEvent: ch,
      });

      // 更新审批状态：把原来的工具标记为 approved/denied，并清除 awaitingApproval 和 approving
      const approvalStatus = decision === "approve" ? "approved" : "denied";
      setTurns((ts) =>
        ts.map((t) => ({
          ...t,
          tools: t.tools.map((tool) =>
            tool.callId === callId
              ? { ...tool, awaitingApproval: false, approving: false, approvalStatus }
              : tool,
          ),
        })),
      );
    } catch (e) {
      console.error("[sprite] 审批异常:", e);
      const errMsg = String(e);
      // 清除 approving 状态
      setTurns((ts) =>
        ts.map((t) => ({
          ...t,
          tools: t.tools.map((tool) =>
            tool.callId === callId ? { ...tool, approving: false } : tool,
          ),
        })),
      );
      // 对 404 错误给出更友好的提示
      if (errMsg.includes("404") || errMsg.includes("no pending approval")) {
        setError("审批失败：该工具调用可能已被处理或已过期，请刷新后重试");
        // 自动清除等待审批状态
        setTurns((ts) =>
          ts.map((t) => ({
            ...t,
            tools: t.tools.map((tool) =>
              tool.callId === callId
                ? { ...tool, awaitingApproval: false, approvalStatus: "denied" }
                : tool,
            ),
          })),
        );
      } else {
        setError(`审批失败: ${errMsg}`);
      }
    }
  };

  // 自动滚动
  useEffect(() => {
    const el = logRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [turns, error]);

  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // 拉取可用模型（.env 默认 + config.json 命名 profile）
  useEffect(() => {
    let alive = true;
    invoke<HarnessModel[]>("harness_models", { base: HARNESS_BASE, token: HARNESS_TOKEN })
      .then((ms) => {
        if (!alive) return;
        const usable = ms.filter((m) => m.id);
        setModels(usable);
        const hasDefault = usable.some((m) => m.id === HARNESS_MODEL);
        if (!hasDefault && usable.length > 0) setModel(usable[0].id);
      })
      .catch(() => {
        /* 拉取失败就只用 .env 默认模型 */
      });
    // 示例问题（空态建议 + 回答后 follow-up）：跟随后端 examples 动态展示。
    invoke<HarnessExample[]>("fetch_examples", { base: HARNESS_BASE, token: HARNESS_TOKEN })
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

  /** 按轮次偏移取几个示例（回答后的 follow-up 轮换，避免每次重复）。 */
  const suggestFor = (round: number) => {
    const pool = examples.length > 0 ? examples : [];
    if (pool.length === 0) return [];
    const out: HarnessExample[] = [];
    for (let i = 0; i < SUGGEST_COUNT && out.length < SUGGEST_COUNT; i++) {
      out.push(pool[(round + i) % pool.length]);
    }
    return out;
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
          title="Resolve Harness"
          onRestore={() => void toggleMinimize()}
          onClose={onClose}
        />
      ) : (
        <>
      <ChatHeader
        title="Resolve Harness"
        statusOk={models.length > 0}
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

      <div className="resolve-log" ref={logRef} onScroll={onScroll}>
        {turns.length === 0 && !error && (
          <div className="resolve-empty">
            FastAPI + LangGraph Agent（同步返回，含工具 trace）。模型 {model || HARNESS_MODEL}。点击示例或直接提问：
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
                Harness
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

              {t.tools.map((tool, i) => (
                <div key={i} className="tool-wrap">
                  <div className="tool-card">
                    <div className="tool-head">
                      <span className={`tool-icon ${tool.kind === "call" ? "run" : "ok"}`}>
                        {tool.kind === "call" ? "⚙" : "✓"}
                      </span>
                      <span className="tool-name">{tool.name}</span>
                      {tool.detail && (
                        <button
                          className="mini-btn"
                          onClick={() => void doCopy(`t-${t.id}-${i}`, tool.detail)}
                        >
                          {copied === `t-${t.id}-${i}` ? "已复制" : "复制"}
                        </button>
                      )}
                    </div>
                    {tool.detail && <CollapsiblePre text={tool.detail} maxLines={6} />}
                    {tool.awaitingApproval && (
                      <div className="tool-approval">
                        <span className="tool-approval-note">
                          {tool.approving ? "审批中…" : "等待审批"}
                        </span>
                        <button
                          className="approval-btn ok"
                          disabled={tool.approving}
                          onClick={() => void decide(tool.threadId || "", tool.callId || "", "approve")}
                        >
                          批准
                        </button>
                        <button
                          className="approval-btn no"
                          disabled={tool.approving}
                          onClick={() => void decide(tool.threadId || "", tool.callId || "", "deny")}
                        >
                          拒绝
                        </button>
                      </div>
                    )}
                    {tool.approvalStatus === "approved" && (
                      <div className="tool-approval tool-approved">
                        <span className="tool-approval-note">✓ 已批准</span>
                      </div>
                    )}
                    {tool.approvalStatus === "denied" && (
                      <div className="tool-approval tool-denied">
                        <span className="tool-approval-note">✗ 已拒绝</span>
                      </div>
                    )}
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
        placeholder={running ? "Agent 运行中…（Enter 停止）" : "问 Resolve Harness…（Enter 发送，Shift+Enter 换行）"}
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

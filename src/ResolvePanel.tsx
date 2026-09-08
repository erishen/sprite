import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useFullscreen } from "./useFullscreen";
import { useMinimize } from "./useMinimize";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChatHeader } from "./components/ChatHeader";
import { ChatInput } from "./components/ChatInput";
import { ChatMiniBar } from "./components/ChatMiniBar";
import { ExampleChips, type PanelExample } from "./components/ExampleChips";
import { CollapsiblePre, renderRich } from "./components/RichText";
import {
  copyText,
  fmtDuration,
  fmtMs,
  extractMdPaths,
  extractPreviewUrls,
  extractHtmlPaths,
  RETRY_CHOICE_RE,
} from "./utils/chatUtils";
import { exportChatMessages, type ChatMessage } from "./utils/chatExport";
import { usePrompts } from "./hooks/usePrompts";
import { useHistory } from "./hooks/useHistory";
import type { ResolveEvent, Health, ToolLog, Turn } from "./types/chat";

/** 后端地址：优先 .env（VITE_RESOLVE_BASE_URL），否则默认本机 8787。 */
const RESOLVE_BASE: string = import.meta.env.VITE_RESOLVE_BASE_URL || "http://127.0.0.1:8787";

/* ---- 建议示例（后端 /api/examples 动态下发） ---- */

/** 空态/回答后各展示几个示例问题。 */
const SUGGEST_COUNT = 3;

export default function ResolvePanel({ onClose }: { onClose: () => void }) {
  const appWindow = getCurrentWindow();
  const [fullscreen, toggleFullscreen] = useFullscreen(appWindow);
  const [minimized, toggleMinimize] = useMinimize(appWindow, undefined, undefined, "left");
  const [health, setHealth] = useState<Health | null>(null);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  useHistory(getCurrentWindow().label, turns, setTurns, false);
  const [copied, setCopied] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ path: string; content: string; size: number } | null>(null);
  const [examples, setExamples] = useState<PanelExample[]>([]);
  const prompts = usePrompts();

  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const toolsRef = useRef<Map<string, ToolLog>>(new Map());
  const deciding = useRef<Set<string>>(new Set());
  const copiedTimer = useRef<number | null>(null);
  const stopRef = useRef(false);
  const turnSeq = useRef(0);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const nextTurnId = () => `t${++turnSeq.current}`;

  /** 复制并短暂显示"已复制"反馈。 */
  const doCopy = async (key: string, text: string) => {
    const ok = await copyText(text);
    setCopied(ok ? key : null);
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1800);
  };

  /** 批准 / 拒绝一个 pending 工具调用（走 Rust 代理避免 CORS）。 */
  const decide = async (id: string, decision: "approve" | "reject") => {
    if (deciding.current.has(id)) return;
    deciding.current.add(id);
    try {
      await invoke("resolve_approve", { base: RESOLVE_BASE, callId: id, decision });
      const tool = toolsRef.current.get(id);
      if (tool) {
        tool.awaitingApproval = false;
        toolsRef.current.set(id, { ...tool });
      }
    } catch (e) {
      setError(`审批失败: ${String(e)}`);
    } finally {
      deciding.current.delete(id);
    }
  };

  // 服务状态
  useEffect(() => {
    let alive = true;
    invoke<Health>("resolve_health", { base: RESOLVE_BASE })
      .then((h) => alive && setHealth(h))
      .catch((e) =>
        alive && setHealth({ ok: false, tools: 0, mcp_servers: 0, uptime_secs: 0, error: String(e) }),
      );
    return () => {
      alive = false;
    };
  }, []);

  // 自动滚动（用户上翻查看历史时不打断）
  const stickBottom = useRef(true);
  useEffect(() => {
    const el = logRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [turns, error]);
  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  /** 更新指定 turn 的部分字段（支持函数式，避免连续流式事件丢失）。 */
  const patchTurn = (
    id: string,
    patch: Partial<Turn> | ((t: Turn) => Partial<Turn>),
  ) =>
    setTurns((ts) =>
      ts.map((t) =>
        t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t,
      ),
    );

  /** 把工具 Map 当前状态同步进指定 turn。 */
  const syncTools = (id: string, extra: Partial<Turn> = {}) =>
    setTurns((ts) =>
      ts.map((t) =>
        t.id === id ? { ...t, tools: [...toolsRef.current.values()], ...extra } : t,
      ),
    );

  const finishTurn = (id: string) => {
    setRunning(false);
    syncTools(id, { done: true });
  };

  /** 统一处理 SSE 事件（send 与 retryTool 共用）。 */
  const handleEvent = (ev: ResolveEvent, assistantId: string) => {
    if (stopRef.current) return;
    switch (ev.type) {
      case "delta":
        patchTurn(assistantId, (t) => ({ text: t.text + ev.text }));
        break;
      case "reasoning":
        patchTurn(assistantId, (t) => ({ reasoning: t.reasoning + ev.text }));
        break;
      case "toolCall": {
        const call = ev.call;
        const id = call?.id ?? `c${toolsRef.current.size}`;
        let args: string | undefined;
        let argsObj: Record<string, unknown> | undefined;
        if (call?.arguments !== undefined) {
          const a = call.arguments as Record<string, unknown>;
          argsObj = a;
          try {
            args = JSON.stringify(a, null, 2);
          } catch {
            args = String(a);
          }
        }
        toolsRef.current.set(id, {
          id,
          name: call?.name ?? "tool",
          state: "running",
          args,
          argsObj,
        });
        syncTools(assistantId);
        break;
      }
      case "approvalRequest": {
        const call = ev.call;
        if (!call?.id) break;
        const prev = toolsRef.current.get(call.id) ?? {
          id: call.id,
          name: call.name ?? "tool",
          state: "running" as const,
        };
        toolsRef.current.set(call.id, { ...prev, awaitingApproval: true });
        syncTools(assistantId);
        break;
      }
      case "toolProgress": {
        const id = ev.payload?.id;
        if (!id) break;
        const prev = toolsRef.current.get(id);
        if (prev) {
          toolsRef.current.set(id, {
            ...prev,
            progress: (prev.progress ?? "") + (ev.payload?.chunk ?? ""),
          });
          syncTools(assistantId);
        }
        break;
      }
      case "toolResult": {
        const id = ev.payload?.call?.id;
        if (!id) break;
        const prev = toolsRef.current.get(id);
        if (prev) {
          const d = ev.payload?.result;
          const rejected = typeof d === "string" && /^user rejected/i.test(d.trim());
          const result = typeof d === "string" ? d : d ? JSON.stringify(d) : undefined;
          toolsRef.current.set(id, {
            ...prev,
            state: !ev.payload?.ok ? (rejected ? "rejected" : "fail") : "ok",
            awaitingApproval: false,
            durationMs: ev.payload?.durationMs,
            result,
          });
          syncTools(assistantId);
        }
        break;
      }
      case "error":
        setError(ev.message);
        finishTurn(assistantId);
        break;
      case "done":
        finishTurn(assistantId);
        break;
    }
  };

  /** 拉取后端示例问题（空态建议 + 回答后 follow-up）。 */
  useEffect(() => {
    let alive = true;
    invoke<PanelExample[]>("fetch_examples", { base: RESOLVE_BASE, token: "" })
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

  /** 发送文本（输入框发送 / 重新生成共用）。 */
  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || running) return;
    stopRef.current = false;
    setError(null);

    const userTurn: Turn = { id: nextTurnId(), role: "user", text: trimmed, reasoning: "", tools: [], done: true };
    const assistantTurn: Turn = { id: nextTurnId(), role: "assistant", text: "", reasoning: "", tools: [], done: false };
    const history = turnsRef.current
      .filter((t) => t.text.trim())
      .map((t) => ({ role: t.role, content: t.text }));
    setTurns((ts) => [...ts, userTurn, assistantTurn]);
    setRunning(true);

    const ch = new Channel<ResolveEvent>();
    ch.onmessage = (ev) => handleEvent(ev, assistantTurn.id);
    try {
      await invoke("resolve_chat", {
        base: RESOLVE_BASE,
        messages: [...history, { role: "user", content: trimmed }],
        win: getCurrentWindow().label,
        onEvent: ch,
      });
    } catch (e) {
      if (!stopRef.current) {
        setError(String(e));
        finishTurn(assistantTurn.id);
      }
    }
  };

  /** 直接重跑单个工具（工具卡上的"重试"），事件流与 chat 相同。 */
  const retryTool = async (name: string, args: Record<string, unknown>) => {
    if (running) return;
    stopRef.current = false;
    setError(null);
    toolsRef.current.clear();
    const assistantTurn: Turn = { id: nextTurnId(), role: "assistant", text: "", reasoning: "", tools: [], done: false };
    setTurns((ts) => [...ts, assistantTurn]);
    setRunning(true);

    const ch = new Channel<ResolveEvent>();
    ch.onmessage = (ev) => handleEvent(ev, assistantTurn.id);
    try {
      await invoke("resolve_tool_run", {
        base: RESOLVE_BASE,
        name,
        arguments: args,
        win: getCurrentWindow().label,
        onEvent: ch,
      });
    } catch (e) {
      if (!stopRef.current) {
        setError(String(e));
        finishTurn(assistantTurn.id);
      }
    }
  };

  /** 停止：中断后端请求（Rust abort 任务 → 断开连接 → 后端停止生成）。 */
  const stop = () => {
    stopRef.current = true;
    void invoke("resolve_chat_abort", { win: getCurrentWindow().label }).catch((e) => console.error("[sprite] 操作失败:", e));
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
    setPreview(null);
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
    await exportChatMessages(messages, "markdown", `Resolve Studio 聊天记录`);
  };

  /** 重新生成最后一条回答：截断到最后 user 消息并重发。 */
  const regenerate = () => {
    if (running) return;
    const ts = turnsRef.current;
    let lastUser = -1;
    for (let i = ts.length - 1; i >= 0; i--) {
      if (ts[i].role === "user") {
        lastUser = i;
        break;
      }
    }
    if (lastUser === -1) return;
    const text = ts[lastUser].text;
    setTurns(ts.slice(0, lastUser));
    window.setTimeout(() => void sendText(text), 0);
  };

  /** 编辑重发：截断到该用户消息，内容放回输入框。 */
  const editFrom = (turnId: string) => {
    if (running) return;
    const ts = turnsRef.current;
    const idx = ts.findIndex((t) => t.id === turnId);
    if (idx === -1 || ts[idx].role !== "user") return;
    setTurns(ts.slice(0, idx));
    setInput(ts[idx].text);
    inputRef.current?.focus();
  };

  /** 打开文件预览（走后端 /api/file，受 fsRoots 沙箱约束）。 */
  const openPreview = async (path: string) => {
    try {
      const r = await invoke<{ path: string; content: string; size: number }>("resolve_file", {
        base: RESOLVE_BASE,
        path,
      });
      setPreview(r);
    } catch (e) {
      setError(`预览失败: ${String(e)}`);
    }
  };

  const healthText = !health
    ? "检查中…"
    : health.ok
      ? `在线 · ${health.tools} 工具 · ${health.mcp_servers} MCP · 运行 ${fmtDuration(health.uptime_secs)}`
      : `离线（${health.error ?? "未启动"}）`;

  return (
    <section className="resolve-panel">
      {minimized ? (
        <ChatMiniBar
          title="Resolve Studio"
          onRestore={() => void toggleMinimize()}
          onClose={onClose}
        />
      ) : (
        <>
      <ChatHeader
        title="Resolve Studio"
        statusOk={!!health?.ok}
        fullscreen={fullscreen}
        onOpenSame={() => void invoke("open_panel", { kind: getCurrentWindow().label.split("-")[0] })}
        onMinimize={() => void toggleMinimize()}
        onFullscreen={() => void toggleFullscreen()}
        onClose={onClose}
        onClear={clearHistory}
        onExport={handleExport}
      >
        <span className="resolve-health">{healthText}</span>
      </ChatHeader>

      <div className="resolve-log" ref={logRef} onScroll={onScroll}>
        {turns.length === 0 && (
          <div className="resolve-empty">
            <div>输入问题，由本机 resolve-studio 的 agent（工具 + 沙箱）来解答。</div>
            <ExampleChips examples={suggestFor(0) as PanelExample[]} onSelect={(t) => void sendText(t)} />
          </div>
        )}

        {turns.map((t, turnIdx) =>
          t.role === "user" ? (
            <div key={t.id} className="msg msg-user">
              <div className="msg-head">
                <span>{t.text}</span>
                <button className="mini-btn" title="编辑并重发" onClick={() => editFrom(t.id)}>
                  ✎
                </button>
              </div>
            </div>
          ) : (
            <div key={t.id} className="msg msg-agent">
              <div className="agent-label">
                <span className="agent-dot" />
                Resolve
                {t.text && !t.done && <span className="cursor" />}
                {t.done && t.text && (
                  <button
                    className="copy-btn"
                    onClick={() => void doCopy(`a-${t.id}`, t.text)}
                  >
                    {copied === `a-${t.id}` ? "已复制" : "复制"}
                  </button>
                )}
                {t.done && (
                  <button
                    className="mini-btn"
                    title="重新生成"
                    onClick={regenerate}
                  >
                    ↻
                  </button>
                )}
              </div>
              {t.tools.length > 0 && (
                <div className="tool-list">
                  {t.tools.map((tool) => {
                    const isErr = tool.state === "fail" || tool.state === "rejected";
                    const displayResult = tool.result
                      ?.replace(/^error:\s*/m, "")
                      .replace(/^PSE_RETRY_CHOICE\n?/m, "");
                    const retryChoice = !!tool.result && RETRY_CHOICE_RE.test(tool.result);
                    return (
                      <div key={tool.id} className="tool-wrap">
                        <div className={`tool-card${isErr ? " tool-card-err" : ""}`}>
                          <div className="tool-head">
                            <span className={`tool-icon ${tool.state}`}>
                              {tool.state === "running"
                                ? ""
                                : tool.state === "ok"
                                  ? "✓"
                                  : "✗"}
                            </span>
                            <span className="tool-name">{tool.name}</span>
                            {tool.durationMs !== undefined && (
                              <span className="tool-duration">{fmtMs(tool.durationMs)}</span>
                            )}
                            <span className={`tool-state ${tool.state}`}>
                              {tool.state === "running"
                                ? "执行中"
                                : tool.state === "ok"
                                  ? "完成"
                                  : tool.state === "rejected"
                                    ? "被拒绝"
                                    : "失败"}
                            </span>
                          </div>

                          {tool.args && (
                            <details className="tool-args" open={tool.state === "running"}>
                              <summary>参数</summary>
                              <CollapsiblePre text={tool.args} maxLines={6} />
                            </details>
                          )}

                          {tool.awaitingApproval && (
                            <div className="tool-approval">
                              <span className="tool-approval-note">等待审批</span>
                              <button
                                className="approval-btn ok"
                                disabled={deciding.current.has(tool.id)}
                                onClick={() => void decide(tool.id, "approve")}
                              >
                                批准
                              </button>
                              <button
                                className="approval-btn no"
                                disabled={deciding.current.has(tool.id)}
                                onClick={() => void decide(tool.id, "reject")}
                              >
                                拒绝
                              </button>
                            </div>
                          )}

                          {tool.state === "running" && tool.progress && (
                            <details className="tool-progress" open>
                              <summary>
                                运行中…（{tool.progress.trim().split("\n").length} 行）
                              </summary>
                              <pre className="tool-pre">{tool.progress}</pre>
                            </details>
                          )}

                          {tool.result !== undefined && (
                            <div className={`tool-result${isErr ? " tool-result-err" : ""}`}>
                              <button
                                className="copy-btn"
                                onClick={() => void doCopy(`d-${tool.id}`, displayResult ?? "")}
                                title="复制与展示一致的内容（已去除 error:/PSE_RETRY_CHOICE 等内部标记）"
                              >
                                {copied === `d-${tool.id}`
                                  ? "已复制"
                                  : isErr
                                    ? "复制详情"
                                    : "复制结果"}
                              </button>
                              <CollapsiblePre text={displayResult ?? ""} maxLines={12} />
                            </div>
                          )}

                          {retryChoice && (
                            <div className="tool-retry">
                              <span className="tool-retry-label">重试选项</span>
                              <button
                                className="retry-btn"
                                onClick={() => void retryTool(tool.name, {})}
                                title="用免费默认网关重新跑一次"
                              >
                                重试（免费）
                              </button>
                              <button
                                className="retry-btn primary"
                                onClick={() => void retryTool(tool.name, { provider: "deepseek" })}
                                title="改用付费 DeepSeek（将触发审批）"
                              >
                                改用 DeepSeek（付费·需审批）
                              </button>
                            </div>
                          )}

                          {!retryChoice && tool.state === "fail" && (
                            <div className="tool-retry">
                              <button
                                className="retry-btn"
                                onClick={() => void retryTool(tool.name, tool.argsObj ?? {})}
                              >
                                重试
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {t.reasoning && (
                <details className="msg-reasoning" open={!t.done}>
                  <summary>
                    思考过程（{t.reasoning.length} 字）
                    <button
                      className="mini-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        void doCopy(`r-${t.id}`, t.reasoning);
                      }}
                    >
                      {copied === `r-${t.id}` ? "已复制" : "复制"}
                    </button>
                  </summary>
                  <div>{renderRich(t.reasoning, RESOLVE_BASE)}</div>
                </details>
              )}
              {t.text && (
                <div className="msg-body">
                  {renderRich(t.text, RESOLVE_BASE)}
                  {!t.done && <span className="cursor" />}
                </div>
              )}
              {t.done &&
                (() => {
                  const all = [
                    t.text,
                    ...t.tools.map((x) => x.result ?? ""),
                  ].join("\n");
                  const mdPaths = extractMdPaths(all);
                  const urls = extractPreviewUrls(all);
                  const htmlPaths = extractHtmlPaths(all);
                  if (mdPaths.length === 0 && urls.length === 0 && htmlPaths.length === 0)
                    return null;
                  return (
                    <div className="file-links">
                      {mdPaths.map((p) => (
                        <button
                          key={p}
                          className="file-link"
                          title={p}
                          onClick={() => void openPreview(p)}
                        >
                          📄 {p.split("/").pop()}
                        </button>
                      ))}
                      {urls.map((u) => (
                        <button
                          key={u}
                          className="file-link"
                          title={u}
                          onClick={() => void openUrl(u)}
                        >
                          🖥️ {u.split("/").pop()}
                        </button>
                      ))}
                      {htmlPaths.map((p) => (
                        <button
                          key={p}
                          className="file-link"
                          title={`在浏览器打开 ${p}`}
                          onClick={() =>
                            void openUrl(`${RESOLVE_BASE}/api/raw?path=${encodeURIComponent(p)}`)
                          }
                        >
                          🌐 {p.split("/").pop()}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              {t.done && t.text && examples.length > 0 && (
                <ExampleChips
                  variant="followup"
                  examples={suggestFor(turnIdx) as PanelExample[]}
                  onSelect={(t2) => void sendText(t2)}
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
        placeholder={running ? "agent 运行中…（Enter 停止）" : "问 resolve-studio…（Enter 发送，Shift+Enter 换行）"}
        inputRef={inputRef}
        onChange={setInput}
        onSend={() => void sendText(input)}
        onStop={stop}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (running) stop();
            else void sendText(input);
          }
        }}
        prompts={prompts}
        onSelectPrompt={(p) => setInput(p.text)}
      />

      {preview && (
        <div className="preview-mask" onClick={() => setPreview(null)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-head">
              <span className="preview-name">{preview.path.split("/").pop()}</span>
              <span className="preview-meta">
                {preview.path} · {(preview.size / 1024).toFixed(1)} KB
              </span>
              <button className="preview-close" onClick={() => setPreview(null)}>
                ✕
              </button>
            </div>
            <pre className="preview-body">{preview.content}</pre>
          </div>
        </div>
      )}
        </>
      )}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useClipboardHistory } from "../hooks/useClipboardHistory";

/** 剪贴板历史面板：按钮 + 下拉列表，显示最近 20 条剪贴板内容，支持搜索过滤，点击复制。 */
export function ClipboardHistory({ enabled = true }: { enabled?: boolean }) {
  const { items, select, clear } = useClipboardHistory(enabled);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const copiedTimerRef = useRef<number | null>(null);

  // 如果禁用剪贴板历史，不渲染按钮
  if (!enabled) {
    return null;
  }

  // 点击历史记录：复制到剪贴板，并显示"已复制"提示
  const handleSelect = async (id: string, text: string) => {
    await select(text);
    setCopiedId(id);
    // 2 秒后清除提示
    if (copiedTimerRef.current) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // 打开时计算弹窗位置（使用 fixed 定位，避免受父容器 3D 变换影响）
  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 280;
      // 确保弹窗不超出窗口左边界
      const leftPos = Math.max(8, rect.right - dropdownWidth);
      setDropdownPos({
        top: rect.bottom + 8,
        left: leftPos,
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  // 搜索过滤
  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((item) => item.text.toLowerCase().includes(q));
  }, [items, query]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  // 高亮匹配的关键词
  const highlightText = (text: string) => {
    if (!query.trim()) return text;
    const q = query.trim();
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="clipboard-highlight">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="clipboard-history" ref={containerRef}>
      <button
        ref={buttonRef}
        className="clipboard-toggle"
        onClick={() => setOpen((v) => !v)}
        title="剪贴板历史"
      >
        📋
      </button>
      {open && (
        <div
          className="clipboard-dropdown"
          style={{
            position: "fixed",
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
          }}
        >
          <div className="clipboard-header">
            <span>剪贴板历史</span>
            {items.length > 0 && (
              <button className="clipboard-clear" onClick={clear}>
                清空
              </button>
            )}
          </div>
          <div className="clipboard-search">
            <input
              ref={inputRef}
              type="text"
              className="clipboard-search-input"
              placeholder="搜索剪贴板历史..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="clipboard-list">
            {items.length === 0 && (
              <div className="clipboard-empty">暂无记录，复制文本后自动保存</div>
            )}
            {items.length > 0 && filteredItems.length === 0 && (
              <div className="clipboard-empty">没有匹配 "{query}" 的记录</div>
            )}
            {filteredItems.map((item) => (
              <button
                key={item.id}
                className={`clipboard-item ${copiedId === item.id ? "copied" : ""}`}
                onClick={() => void handleSelect(item.id, item.text)}
                title={item.text}
              >
                <span className="clipboard-item-text">{highlightText(item.text)}</span>
                <span className="clipboard-item-time">
                  {copiedId === item.id ? (
                    <span className="clipboard-copied-badge">✓ 已复制</span>
                  ) : (
                    fmtTime(item.time)
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

export interface PromptTemplate {
  label: string;
  text: string;
}

interface PromptTemplatesProps {
  prompts: PromptTemplate[];
  onSelect: (text: string) => void;
}

/** 提示词模板按钮：点击展开模板列表，支持搜索，选中后填入输入框。 */
export function PromptTemplates({ prompts, onSelect }: PromptTemplatesProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = prompts.filter((p) =>
    p.label.toLowerCase().includes(query.toLowerCase()) ||
    p.text.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="prompt-templates" ref={containerRef}>
      <button
        className="prompt-toggle"
        onClick={() => setOpen((v) => !v)}
        title="提示词模板"
      >
        📋
      </button>
      {open && (
        <div className="prompt-dropdown">
          <input
            className="prompt-search"
            placeholder="搜索模板…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="prompt-list">
            {filtered.length === 0 && (
              <div className="prompt-empty">无匹配模板</div>
            )}
            {filtered.map((p) => (
              <button
                key={p.label}
                className="prompt-item"
                onClick={() => {
                  onSelect(p.text);
                  setOpen(false);
                  setQuery("");
                }}
                title={p.text}
              >
                <span className="prompt-item-label">{p.label}</span>
                <span className="prompt-item-preview">{p.text.slice(0, 30)}…</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

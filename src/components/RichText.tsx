import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

/** 可折叠的 <pre> 代码块，超过 maxLines 行时显示展开/收起按钮。 */
export function CollapsiblePre({ text, maxLines = 12 }: { text: string; maxLines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const needs = lines.length > maxLines;
  const display = expanded ? text : lines.slice(0, maxLines).join("\n");
  return (
    <div className="tool-pre-wrap">
      <pre className="tool-pre">{display}</pre>
      {needs && (
        <button className="tool-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收起 ▲" : `展开全部 (${lines.length} 行) ▼`}
        </button>
      )}
    </div>
  );
}

/* ---- 轻量 markdown：标题 / 列表 / 引用 / 代码块 / 表格 / 行内 code·粗体·斜体·链接 ---- */
const INLINE_RE = /`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g;

/**
 * 行内渲染：用 exec 循环手工切 token，避免 split(带捕获组) 产生 undefined 崩溃。
 * @param baseUrl 用于补全以 / 开头的相对链接（如 Resolve Studio 的 /api/raw?path=...）
 */
function inline(line: string, keyBase: string, baseUrl?: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(line)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`${keyBase}-t${k++}`}>{line.slice(last, m.index)}</span>);
    }
    const tok = m[0];
    if (tok.startsWith("`")) {
      nodes.push(<code key={`${keyBase}-${k++}`}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={`${keyBase}-${k++}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      nodes.push(<em key={`${keyBase}-${k++}`}>{tok.slice(1, -1)}</em>);
    } else if (m[1] !== undefined && m[2] !== undefined) {
      // 站内相对链接（如 /api/raw?path=...）补全 baseUrl 后交系统浏览器打开。
      const href = baseUrl && m[2].startsWith("/") ? `${baseUrl}${m[2]}` : m[2];
      nodes.push(
        <a
          key={`${keyBase}-${k++}`}
          href={href}
          onClick={(e) => {
            e.preventDefault();
            void openUrl(href);
          }}
        >
          {m[1]}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < line.length) {
    nodes.push(<span key={`${keyBase}-t${k++}`}>{line.slice(last)}</span>);
  }
  return nodes;
}

/**
 * 轻量 Markdown 渲染：标题 / 列表 / 引用 / 代码块 / 表格 / 行内格式。
 * @param text 要渲染的 Markdown 文本
 * @param baseUrl 可选，用于补全以 / 开头的相对链接
 */
export function renderRich(text: string, baseUrl?: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split("\n");
  let codeBlock: string[] | null = null;
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[][] | null = null;
  let prevLine = "";
  let seq = 0;

  const parseTableRow = (line: string): string[] | null => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
    return trimmed.slice(1, -1).split("|").map((c) => c.trim());
  };

  const isTableSeparator = (line: string): boolean => {
    const cells = parseTableRow(line);
    if (!cells || cells.length === 0) return false;
    return cells.every((c) => /^:?-+:?$/.test(c));
  };

  const flushTable = () => {
    if (!table || table.length < 2) {
      table = null;
      return;
    }
    const [header, ...rows] = table;
    nodes.push(
      <div key={`table-${seq++}`} style={{ margin: "6px 0", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th
                  key={i}
                  style={{
                    border: "1px solid rgba(255,255,255,0.15)",
                    padding: "4px 8px",
                    textAlign: "left",
                    background: "rgba(255,255,255,0.06)",
                    fontWeight: 600,
                  }}
                >
                  {inline(cell, `th-${seq}-${i}`, baseUrl)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{ border: "1px solid rgba(255,255,255,0.1)", padding: "4px 8px" }}
                  >
                    {inline(cell, `td-${seq}-${ri}-${ci}`, baseUrl)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = null;
  };

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => (
      <li key={i}>{inline(it, `li-${seq}-${i}`, baseUrl)}</li>
    ));
    nodes.push(
      list.ordered ? (
        <ol key={`list-${seq++}`} style={{ margin: "4px 0", paddingLeft: 18 }}>
          {items}
        </ol>
      ) : (
        <ul key={`list-${seq++}`} style={{ margin: "4px 0", paddingLeft: 18 }}>
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // 如果正在收集表格行
    if (table) {
      const row = parseTableRow(line);
      if (row && row.length > 0) {
        table.push(row);
        prevLine = line;
        continue;
      }
      flushTable();
    }

    if (codeBlock) {
      if (line.startsWith("```")) {
        nodes.push(
          <pre key={`code-${seq++}`} style={{ whiteSpace: "pre-wrap" }}>
            {codeBlock.join("\n")}
          </pre>,
        );
        codeBlock = null;
      } else {
        codeBlock.push(line);
      }
      prevLine = line;
      continue;
    }
    if (line.startsWith("```")) {
      flushList();
      codeBlock = [];
      prevLine = line;
      continue;
    }
    const ul = line.match(/^\s*[-*] (.*)$/);
    const ol = line.match(/^\s*\d+[.)] (.*)$/);
    if (ul || ol) {
      if (!list || list.ordered !== !!ol) {
        flushList();
        list = { ordered: !!ol, items: [] };
      }
      list.items.push((ul ?? ol)![1] as string);
      prevLine = line;
      continue;
    }
    flushList();
    if (!line.trim()) {
      nodes.push(<div key={`gap-${seq++}`} style={{ height: 4 }} />);
      prevLine = line;
      continue;
    }

    // 检测表格分隔行（| --- | --- |），如果上一行是表格行则开始收集表格
    if (isTableSeparator(line)) {
      const header = parseTableRow(prevLine);
      if (header && header.length > 0) {
        // 移除 prevLine 作为普通段落添加的节点
        if (nodes.length > 0) nodes.pop();
        table = [header];
        prevLine = line;
        continue;
      }
    }

    const h = line.match(/^(#{1,3}) (.*)$/);
    if (h) {
      const level = h[1].length;
      const size = level === 1 ? "15px" : level === 2 ? "14px" : "13px";
      nodes.push(
        <div key={`h-${seq++}`} style={{ fontWeight: 600, fontSize: size, margin: "6px 0 2px" }}>
          {inline(h[2], `h-${seq}`, baseUrl)}
        </div>,
      );
      prevLine = line;
      continue;
    }
    if (line.startsWith(">")) {
      nodes.push(
        <div
          key={`q-${seq++}`}
          style={{ borderLeft: "2px solid rgba(165,180,252,0.4)", paddingLeft: 8, color: "#9aa2c0", margin: "3px 0" }}
        >
          {inline(line.replace(/^>\s?/, ""), `q-${seq}`, baseUrl)}
        </div>,
      );
      prevLine = line;
      continue;
    }
    nodes.push(
      <div key={`p-${seq++}`} style={{ margin: "2px 0" }}>
        {inline(line, `p-${seq}`, baseUrl)}
      </div>,
    );
    prevLine = line;
  }
  if (codeBlock) {
    nodes.push(
      <pre key={`code-${seq++}`} style={{ whiteSpace: "pre-wrap" }}>
        {codeBlock.join("\n")}
      </pre>,
    );
  }
  flushList();
  flushTable();
  return nodes;
}

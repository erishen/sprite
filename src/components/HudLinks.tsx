import { useState, useMemo } from "react";
import type { Launcher } from "../App";

interface HudLinksProps {
  launchers: Launcher[];
  onRun: (launcher: Launcher) => void;
}

const LINK_SECTIONS = [
  { label: "常用网页", kinds: ["url"] as const },
  { label: "本地应用", kinds: ["app", "bundle"] as const },
  { label: "快捷操作", kinds: ["script"] as const },
];

/**
 * 快捷方式网格：按 url/app+bundle/script 分组渲染，空组自动隐藏。
 * 支持搜索过滤：输入关键词后实时过滤所有快捷方式。
 */
export function HudLinks({ launchers, onRun }: HudLinksProps) {
  const [searchQuery, setSearchQuery] = useState("");

  /** 过滤后的快捷方式列表 */
  const filteredLaunchers = useMemo(() => {
    if (!searchQuery.trim()) return launchers;
    const query = searchQuery.toLowerCase().trim();
    return launchers.filter((l) => {
      // 匹配标签
      if (l.label.toLowerCase().includes(query)) return true;
      // 匹配 URL
      if (l.kind === "url" && l.url.toLowerCase().includes(query)) return true;
      // 匹配应用名
      if (l.kind === "app" && l.app.toLowerCase().includes(query)) return true;
      // 匹配 bundleId
      if (l.kind === "bundle" && l.bundleId.toLowerCase().includes(query)) return true;
      // 匹配命令
      if (l.kind === "script" && l.command.toLowerCase().includes(query)) return true;
      return false;
    });
  }, [launchers, searchQuery]);

  /** 分组后的快捷方式 */
  const groups: { label: string; items: Launcher[] }[] = useMemo(() => {
    if (searchQuery.trim()) {
      // 搜索模式下不分组，直接显示所有匹配结果
      return filteredLaunchers.length > 0
        ? [{ label: `搜索结果 (${filteredLaunchers.length})`, items: filteredLaunchers }]
        : [];
    }
    return LINK_SECTIONS.map((sec) => ({
      label: sec.label,
      items: launchers.filter((l) => (sec.kinds as readonly string[]).includes(l.kind)),
    })).filter((g) => g.items.length > 0);
  }, [launchers, filteredLaunchers, searchQuery]);

  /** 获取快捷方式的提示文本 */
  const getTooltip = (launcher: Launcher): string => {
    if (launcher.kind === "url") return launcher.url;
    if (launcher.kind === "app") return `启动应用: ${launcher.app}`;
    if (launcher.kind === "bundle") return `启动应用: ${launcher.bundleId}`;
    if (launcher.kind === "script") return `运行: ${launcher.command}`;
    return (launcher as { label: string }).label;
  };

  /** 高亮匹配的文本 */
  const highlightMatch = (text: string): React.ReactNode => {
    if (!searchQuery.trim()) return text;
    const query = searchQuery.trim();
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return text;
    return (
      <>
        {text.slice(0, index)}
        <span className="search-highlight">{text.slice(index, index + query.length)}</span>
        {text.slice(index + query.length)}
      </>
    );
  };

  return (
    <section className="hud-links">
      {/* 搜索框 */}
      <div className="link-search">
        <input
          type="text"
          className="link-search-input"
          placeholder="搜索快捷方式..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSearchQuery("");
            }
          }}
        />
        {searchQuery && (
          <button
            className="link-search-clear"
            onClick={() => setSearchQuery("")}
            title="清除搜索"
          >
            ✕
          </button>
        )}
      </div>

      {/* 快捷方式分组 */}
      {groups.length === 0 && searchQuery.trim() && (
        <div className="link-no-results">
          没有找到匹配 "{searchQuery}" 的快捷方式
        </div>
      )}

      {groups.map((group) => (
        <div key={group.label} className="link-group">
          <div className="link-group-label">{group.label}</div>
          <div className="link-grid">
            {group.items.map((launcher) => (
              <button
                key={`${launcher.kind}:${launcher.label}`}
                className="link-btn"
                onClick={() => {
                  onRun(launcher);
                  // 点击后清除搜索，方便下次使用
                  setSearchQuery("");
                }}
                title={getTooltip(launcher)}
              >
                {highlightMatch(launcher.label)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

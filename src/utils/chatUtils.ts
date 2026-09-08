/** Fisher-Yates 洗牌（返回新数组，不修改原数组）。 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 复制文本到剪贴板，返回是否成功。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 降级：用 textarea + execCommand
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

/** 滚动到底部（stickBottom 为 true 时才滚）。 */
export function scrollToBottom(el: HTMLElement | null, stickBottom: { current: boolean }) {
  if (el && stickBottom.current) {
    el.scrollTop = el.scrollHeight;
  }
}

/* ---- 时间格式化 ---- */

/** 格式化秒数为易读的时长（如 90s → 1m30s）。 */
export function fmtDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  return `${m}m${Math.round(secs % 60)}s`;
}

/** 格式化毫秒数为易读的时长（如 1500ms → 1.5s）。 */
export function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/* ---- 文本路径/URL 提取 ---- */

/** 结果里 pse-review 的"可选择重试"哨兵（与 web 端一致，行首锚定）。 */
export const RETRY_CHOICE_RE = /^error:\s*PSE_RETRY_CHOICE\b|^PSE_RETRY_CHOICE\b/m;

/** 提取可预览的 .md 路径（绝对路径根 + 含 / 的相对路径，排除 URL）。 */
const MD_PATH_RE = /((?:\/(?:Users|home|tmp|var|opt|usr|etc)|[A-Za-z0-9_.-]+)\/[^\s'"<>]*\.md)/g;
export function extractMdPaths(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = MD_PATH_RE.exec(text)) !== null) {
    // 排除 URL 与 glob/占位通配路径（如 skills/*/SKILL.md），它们不是可预览的真实文件。
    if (m[1].includes("://")) continue;
    if (/[*?[\]{}]/.test(m[1])) continue;
    out.add(m[1]);
  }
  return [...out];
}

/** 提取可预览的 http 报告 URL（.html/.json/.png 等，用系统浏览器打开）。 */
const PREVIEW_URL_RE = /(https?:\/\/[^\s'"<>)]+\.(?:html?|json|png|jpe?g|svg))/g;
export function extractPreviewUrls(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = PREVIEW_URL_RE.exec(text)) !== null) out.add(m[1]);
  return [...out];
}

/** 提取本地 .html 报告绝对路径，走 /api/raw 由系统浏览器渲染成真页面。
 *  仅收绝对路径：/api/raw 按字面解析 path，相对路径会落在服务进程 cwd 而失败。 */
const HTML_PATH_RE = /(\/(?:Users|home|tmp|var|opt|usr|etc)\/[^\s'"<>]*\.html?)/g;
export function extractHtmlPaths(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = HTML_PATH_RE.exec(text)) !== null) {
    if (m[1].includes("://")) continue;
    if (/[*?[\]{}]/.test(m[1])) continue;
    out.add(m[1]);
  }
  return [...out];
}

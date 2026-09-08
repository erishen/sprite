import { useCallback, useEffect, useRef, useState } from "react";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

const MAX_ITEMS = 20;
const POLL_INTERVAL = 1000; // ms（从 500ms 调整为 1000ms，降低 CPU 占用）

export interface ClipboardItem {
  id: string;
  text: string;
  time: number;
}

/**
 * 敏感信息检测正则表达式
 * 检测到这些格式时，自动跳过，不记录到剪贴板历史
 */
const SENSITIVE_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // 信用卡号（13-19位数字，可能有空格或连字符分隔）
  {
    name: "信用卡号",
    regex: /\b(?:\d[ -]*?){13,19}\b/,
  },
  // 中国身份证号（18位，最后一位可能是X/x）
  {
    name: "身份证号",
    regex: /\b[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/,
  },
  // 中国手机号（11位，1开头）
  {
    name: "手机号",
    regex: /\b1[3-9]\d{9}\b/,
  },
  // OpenAI API Key (sk-...)
  {
    name: "OpenAI API Key",
    regex: /\bsk-[a-zA-Z0-9]{20,}\b/,
  },
  // GitHub Token (ghp_, gho_, ghu_, ghs_, ghr_)
  {
    name: "GitHub Token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{20,}\b/,
  },
  // 通用 API Key / Token (key=xxx, token=xxx, api_key=xxx)
  {
    name: "API Key/Token",
    regex: /\b(?:api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*["']?[a-zA-Z0-9_\-]{8,}["']?/i,
  },
  // AWS Access Key ID
  {
    name: "AWS Access Key",
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  // 私钥（PEM 格式）
  {
    name: "私钥",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  // 银行卡号（16-19位数字）
  {
    name: "银行卡号",
    regex: /\b\d{16,19}\b/,
  },
  // JSON Web Token (JWT)
  {
    name: "JWT Token",
    regex: /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/,
  },
];

/**
 * 检测文本是否包含敏感信息
 * @param text 要检测的文本
 * @returns 如果包含敏感信息，返回 true；否则返回 false
 */
function containsSensitiveInfo(text: string): boolean {
  // 太短的文本不检测（避免误判）
  if (text.length < 8) return false;

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.regex.test(text)) {
      console.log(`[sprite] 检测到敏感信息（${pattern.name}），已跳过剪贴板历史记录`);
      return true;
    }
  }
  return false;
}

/** 剪贴板历史：轮询检测剪贴板变化，记录最近 20 条文本，支持去重、清空、重新复制。 */
export function useClipboardHistory(enabled: boolean = true) {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const lastTextRef = useRef<string>("");

  // 轮询剪贴板变化
  useEffect(() => {
    // 如果禁用剪贴板历史，清空历史并跳过轮询
    if (!enabled) {
      setItems([]);
      return;
    }

    let alive = true;

    const check = async () => {
      try {
        // 检查是否在忽略时间窗口内（复制密码时设置，避免密码出现在剪贴板历史）
        const skipUntil = (window as unknown as { __skipClipboardUntil?: number }).__skipClipboardUntil;
        if (skipUntil && Date.now() < skipUntil) {
          return;
        }
        const text = await readText();
        if (!alive) return;
        if (!text || !text.trim()) return;
        if (text === lastTextRef.current) return; // 去重

        // 敏感信息检测：自动跳过，不记录到剪贴板历史
        if (containsSensitiveInfo(text)) {
          lastTextRef.current = text; // 更新 lastText，避免重复检测
          return;
        }

        lastTextRef.current = text;
        setItems((prev) => {
          const item: ClipboardItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            text,
            time: Date.now(),
          };
          return [item, ...prev].slice(0, MAX_ITEMS);
        });
      } catch {
        // 读取失败忽略（如剪贴板为空或非文本内容）
      }
    };

    // 初始读取
    void check();

    const timer = setInterval(() => void check(), POLL_INTERVAL);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // 重新复制某条到剪贴板
  const select = useCallback(async (text: string) => {
    try {
      await writeText(text);
      lastTextRef.current = text;
    } catch (e) {
      console.error("[sprite] 复制到剪贴板失败:", e);
    }
  }, []);

  // 清空历史
  // 注意：不清空 lastTextRef，避免下一次轮询时把当前剪贴板内容重新加回来
  const clear = useCallback(() => {
    setItems([]);
  }, []);

  return { items, select, clear };
}

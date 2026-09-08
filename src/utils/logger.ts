/**
 * 日志工具函数
 * 支持生产环境敏感信息自动脱敏
 *
 * 敏感信息类型：
 * - API Key (sk-..., ghp_..., AKIA...)
 * - Token (JWT, Bearer token)
 * - 密码 (password=..., secret=...)
 * - 信用卡号
 * - 身份证号
 * - 手机号
 */

/** 敏感信息检测和脱敏规则 */
const SENSITIVE_RULES: Array<{
  name: string;
  regex: RegExp;
  mask: (...args: string[]) => string;
}> = [
  // OpenAI API Key (sk-...)
  {
    name: "OpenAI API Key",
    regex: /\bsk-[a-zA-Z0-9]{20,}\b/g,
    mask: (m) => `sk-${m.slice(3, 7)}...${m.slice(-4)}`,
  },
  // GitHub Token (ghp_, gho_, ghu_, ghs_, ghr_)
  {
    name: "GitHub Token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{20,}\b/g,
    mask: (m) => `${m.slice(0, 4)}...${m.slice(-4)}`,
  },
  // AWS Access Key ID
  {
    name: "AWS Access Key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    mask: (m) => `AKIA${m.slice(4, 8)}...${m.slice(-4)}`,
  },
  // JWT Token
  {
    name: "JWT Token",
    regex: /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
    mask: (m) => `eyJ...${m.slice(-10)}`,
  },
  // Bearer Token (Authorization: Bearer xxx)
  {
    name: "Bearer Token",
    regex: /(Bearer\s+)([a-zA-Z0-9._-]{20,})/gi,
    mask: (_m, p1, p2) => `${p1}${p2.slice(0, 6)}...${p2.slice(-4)}`,
  },
  // 通用 API Key / Token / Secret / Password (key=xxx, token=xxx)
  {
    name: "API Key/Token/Secret/Password",
    regex: /((?:api[_-]?key|token|secret|password|passwd|pwd|authorization)\s*[:=]\s*["']?)([a-zA-Z0-9_\-]{8,})(["']?)/gi,
    mask: (_m, p1, p2, p3) => `${p1}${p2.slice(0, 4)}...${p2.slice(-4)}${p3}`,
  },
  // 信用卡号（13-19位数字，可能有空格或连字符）
  {
    name: "信用卡号",
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    mask: (m) => {
      const digits = m.replace(/[\s-]/g, "");
      if (digits.length < 13) return m;
      return `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`;
    },
  },
  // 中国身份证号（18位）
  {
    name: "身份证号",
    regex: /\b[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
    mask: (m) => `${m.slice(0, 6)}********${m.slice(-4)}`,
  },
  // 中国手机号（11位）
  {
    name: "手机号",
    regex: /\b1[3-9]\d{9}\b/g,
    mask: (m) => `${m.slice(0, 3)}****${m.slice(-4)}`,
  },
];

/**
 * 对文本中的敏感信息进行脱敏
 * @param text 原始文本
 * @returns 脱敏后的文本
 */
export function maskSensitiveInfo(text: string): string {
  let result = text;
  for (const rule of SENSITIVE_RULES) {
    result = result.replace(rule.regex, (...matchArgs: string[]) => {
      try {
        return rule.mask(...matchArgs);
      } catch {
        return "[REDACTED]";
      }
    });
  }
  return result;
}

/**
 * 对对象中的敏感信息进行脱敏（递归处理）
 * @param obj 原始对象
 * @returns 脱敏后的对象
 */
export function maskSensitiveObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === "string") {
    return maskSensitiveInfo(obj);
  }
  if (typeof obj === "number" || typeof obj === "boolean") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveObject(item));
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // 对敏感字段名直接打码
      if (
        /(api[_-]?key|token|secret|password|passwd|pwd|authorization|cookie)/i.test(key) &&
        typeof value === "string"
      ) {
        result[key] = value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : "[REDACTED]";
      } else {
        result[key] = maskSensitiveObject(value);
      }
    }
    return result;
  }
  return obj;
}

/**
 * 格式化日志参数，对敏感信息进行脱敏
 * @param args 原始日志参数
 * @returns 脱敏后的日志参数
 */
function formatArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === "string") {
      return maskSensitiveInfo(arg);
    }
    if (typeof arg === "object" && arg !== null) {
      return maskSensitiveObject(arg);
    }
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: maskSensitiveInfo(arg.message),
        stack: arg.stack ? maskSensitiveInfo(arg.stack) : undefined,
      };
    }
    return arg;
  });
}

/**
 * 初始化日志脱敏
 * 在生产环境中重写 console 方法，自动脱敏敏感信息
 * 在开发环境中不重写，保持原始日志
 */
export function initLogger(): void {
  const isProduction = import.meta.env.PROD;

  if (!isProduction) {
    console.log("[sprite] 开发环境：日志脱敏未启用");
    return;
  }

  console.log("[sprite] 生产环境：日志脱敏已启用");

  // 保存原始方法
  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalInfo = console.info.bind(console);
  const originalDebug = console.debug.bind(console);

  // 重写 console 方法
  console.log = (...args: unknown[]) => {
    originalLog(...formatArgs(args));
  };

  console.error = (...args: unknown[]) => {
    originalError(...formatArgs(args));
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...formatArgs(args));
  };

  console.info = (...args: unknown[]) => {
    originalInfo(...formatArgs(args));
  };

  console.debug = (...args: unknown[]) => {
    originalDebug(...formatArgs(args));
  };
}

/**
 * 创建带前缀的 logger
 * @param prefix 日志前缀（如 [sprite]）
 * @returns logger 对象
 */
export function createLogger(prefix: string) {
  return {
    log: (...args: unknown[]) => console.log(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
  };
}

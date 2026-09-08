import type { Settings } from "../hooks/useSettings";

/** 合并后的配置（优先 settings，回退到 .env）。 */
export interface MergedConfig {
  resolveBase: string;
  springBase: string;
  springModel: string;
  harnessBase: string;
  harnessToken: string;
  harnessModel: string;
  builtinBase: string;
  builtinApiKey: string;
  builtinModel: string;
  llmConfigured: boolean;
}

/**
 * 合并 settings 和 .env 配置：
 * - settings 中有值时优先使用 settings
 * - settings 中为空时回退到 .env
 * - 都没有时使用默认值
 */
export function mergeConfig(settings: Settings | null): MergedConfig {
  const env = {
    resolveBase: (import.meta.env.VITE_RESOLVE_BASE_URL as string) || "http://127.0.0.1:8787",
    springBase: (import.meta.env.VITE_SPRING_BASE_URL as string) || "http://127.0.0.1:8080",
    springModel: (import.meta.env.VITE_SPRING_MODEL as string) || "",
    harnessBase: (import.meta.env.VITE_HARNESS_BASE_URL as string) || "http://127.0.0.1:8899",
    harnessToken: (import.meta.env.VITE_HARNESS_API_TOKEN as string) || "",
    harnessModel: (import.meta.env.VITE_HARNESS_MODEL as string) || "",
    builtinBase: (import.meta.env.VITE_LLM_BASE_URL as string) || "",
    builtinApiKey: (import.meta.env.VITE_LLM_API_KEY as string) || "",
    builtinModel: (import.meta.env.VITE_LLM_MODEL as string) || "",
  };

  const s = settings || {
    builtin: { baseUrl: "", apiKey: "", model: "" },
    resolve: { baseUrl: "" },
    spring: { baseUrl: "", model: "" },
    harness: { baseUrl: "", apiToken: "", model: "" },
  };

  const resolveBase = s.resolve.baseUrl || env.resolveBase;
  const springBase = s.spring.baseUrl || env.springBase;
  const springModel = s.spring.model || env.springModel;
  const harnessBase = s.harness.baseUrl || env.harnessBase;
  const harnessToken = s.harness.apiToken || env.harnessToken;
  const harnessModel = s.harness.model || env.harnessModel;
  const builtinBase = s.builtin.baseUrl || env.builtinBase;
  const builtinApiKey = s.builtin.apiKey || env.builtinApiKey;
  const builtinModel = s.builtin.model || env.builtinModel;

  return {
    resolveBase,
    springBase,
    springModel,
    harnessBase,
    harnessToken,
    harnessModel,
    builtinBase,
    builtinApiKey,
    builtinModel,
    llmConfigured: !!(builtinApiKey && builtinBase),
  };
}

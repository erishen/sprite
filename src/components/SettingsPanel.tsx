import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings, type Settings } from "../hooks/useSettings";
import { mergeConfig } from "../utils/mergedConfig";
import { useDebugMode } from "../hooks/useDebugMode";
import { useDragWindow } from "../hooks/useDragWindow";
import { useFullscreen } from "../useFullscreen";
import { useMinimize } from "../useMinimize";
import { CustomItemsManager } from "./CustomItemsManager";
import { exportDataToFile, clearAllData, getDataStorageInfo } from "../utils/dataManagement";
import { validateUrl } from "../utils/urlValidator";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  onClose: () => void;
}

/** 设置窗口：配置 AI 后端和内置 LLM。 */
export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, loaded, saving, save } = useSettings();
  const [draft, setDraft] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmMasterPassword, setConfirmMasterPassword] = useState("");
  const [masterPasswordError, setMasterPasswordError] = useState<string | null>(null);
  const { debugMode, setDebugMode } = useDebugMode();
  const appWindow = getCurrentWindow();
  const [fullscreen, toggleFullscreen] = useFullscreen(appWindow);
  const [minimized, toggleMinimize] = useMinimize(appWindow);
  // 数据管理相关状态
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState("");
  const [storageInfo, setStorageInfo] = useState({ localStorageSize: 0, localStorageCount: 0, customItemsCount: 0 });
  // 合并后的配置（优先 settings，回退到 .env），用于展示当前生效的值
  const effective = mergeConfig(loaded ? settings : null);

  useDragWindow(appWindow);

  // 设置加载完成后，同步到 draft（只在初始加载时同步，后续不覆盖用户修改）
  const initializedRef = useRef(false);
  useEffect(() => {
    if (loaded && !initializedRef.current) {
      setDraft(settings);
      initializedRef.current = true;
    }
  }, [loaded, settings]);

  // 更新 draft
  const updateDraft = (patch: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };

  // 开关类设置：切换时立即保存（实时更新母窗口）
  const toggleAndSave = async (patch: Partial<Settings>) => {
    const newSettings = { ...draft, ...patch };
    setDraft(newSettings);
    setSaved(false);
    // 立即保存设置，触发 settings-updated 事件，母窗口实时更新
    await save(newSettings);
  };

  // 保存设置
  const handleSave = async () => {
    setSaveError(null);
    setMasterPasswordError(null);

    // 验证主密码
    if (draft.masterPasswordEnabled) {
      if (!draft.masterPassword) {
        setMasterPasswordError("请输入主密码");
        return;
      }
      if (draft.masterPassword !== confirmMasterPassword) {
        setMasterPasswordError("两次输入的主密码不一致");
        return;
      }
    }

    const ok = await save(draft);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // 保存成功后清空确认密码
      setConfirmMasterPassword("");
      // 保存成功后重新注册全局热键
      try {
        await invoke("register_toggle_hotkey", { hotkeyStr: draft.hotkey });
        console.log("[sprite] 全局热键已更新:", draft.hotkey);
      } catch (e) {
        console.error("[sprite] 注册全局热键失败:", e);
        setSaveError(`热键注册失败: ${e}`);
      }
    } else {
      setSaveError("保存失败，请查看控制台日志");
    }
  };

  // 刷新数据存储信息
  const refreshStorageInfo = () => {
    setStorageInfo(getDataStorageInfo());
  };

  // 组件加载时刷新数据存储信息
  useEffect(() => {
    refreshStorageInfo();
  }, []);

  // 导出数据
  const handleExport = async () => {
    setExporting(true);
    try {
      const ok = await exportDataToFile();
      if (ok) {
        alert("数据导出成功！");
      }
    } catch (e) {
      console.error("[sprite] 导出失败:", e);
      alert("数据导出失败，请查看控制台日志");
    } finally {
      setExporting(false);
    }
  };

  // 清除所有数据
  const handleClearAll = async () => {
    if (clearConfirm !== "DELETE") {
      alert("请输入 DELETE 确认清除所有数据");
      return;
    }
    if (!confirm("确定要清除所有数据吗？此操作不可恢复！")) {
      return;
    }
    setClearing(true);
    try {
      const ok = await clearAllData("DELETE");
      if (ok) {
        alert("所有数据已清除！应用将重新加载...");
        // 重新加载页面
        window.location.reload();
      } else {
        alert("清除数据失败，请查看控制台日志");
      }
    } catch (e) {
      console.error("[sprite] 清除数据失败:", e);
      alert("清除数据失败，请查看控制台日志");
    } finally {
      setClearing(false);
    }
  };

  if (minimized) {
    return (
      <div className="settings-minibar">
        <span className="minibar-title">⚙ 设置</span>
        <span className="minibar-actions">
          <button onClick={() => void toggleMinimize()} title="还原">
            ⤢
          </button>
          <button onClick={onClose} title="关闭">
            ✕
          </button>
        </span>
      </div>
    );
  }

  return (
    <section className={`settings-panel ${fullscreen ? "fullscreen" : ""}`}>
      {/* 标题栏 */}
      <div className="settings-header">
        <span className="settings-title">⚙ 设置</span>
        <span className="settings-actions">
          <button onClick={() => void toggleMinimize()} title="最小化">
            ─
          </button>
          <button onClick={() => void toggleFullscreen()} title={fullscreen ? "还原" : "全屏"}>
            ⛶
          </button>
          <button onClick={onClose} title="关闭">
            ✕
          </button>
        </span>
      </div>

      <div className="settings-content">
        {!loaded ? (
          <div className="settings-loading">加载设置中...</div>
        ) : (
          <>
            {/* 调试开关 */}
            <section className="settings-section debug-section">
              <div className="debug-toggle-row">
                <div className="debug-info">
                  <h3>🔧 调试模式</h3>
                  <p className="settings-desc">开启后展示私有配置（launchers.local.json / prompts.local.json），关闭后只展示公开配置，方便分享截图。</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={debugMode}
                    onChange={(e) => setDebugMode(e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </section>

            {/* 外观设置 */}
            <section className="settings-section">
              <h3>🎨 外观设置</h3>
              <p className="settings-desc">自定义窗口标题，显示在母窗口顶部（建议不超过 6 个字符）。</p>
              <div className="settings-field">
                <label>窗口标题</label>
                <input
                  type="text"
                  placeholder="ESN"
                  value={draft.appTitle}
                  onChange={(e) => {
                    // 1. 转大写
                    // 2. 过滤危险字符（防止 XSS），只允许字母、数字、空格、下划线、连字符
                    // 3. 手动截断到 6 个字符（拼音输入法时 maxLength 可能不生效）
                    const filtered = e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9 _\-]/g, "")
                      .slice(0, 6);
                    updateDraft({ appTitle: filtered });
                  }}
                  maxLength={6}
                  style={{ textTransform: "uppercase" }}
                />
              </div>

              {/* 功能开关 */}
              <div className="debug-toggle-row">
                <div className="debug-info">
                  <h3>🍅 番茄时钟</h3>
                  <p className="settings-desc">开启后在母窗口显示番茄时钟，支持工作/休息模式。</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={draft.pomodoroEnabled}
                    onChange={(e) => void toggleAndSave({ pomodoroEnabled: e.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="debug-toggle-row">
                <div className="debug-info">
                  <h3>📊 系统资源监控</h3>
                  <p className="settings-desc">开启后在母窗口显示 CPU、内存、硬盘使用率。</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={draft.systemMonitorEnabled}
                    onChange={(e) => void toggleAndSave({ systemMonitorEnabled: e.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="debug-toggle-row">
                <div className="debug-info">
                  <h3>📋 剪贴板历史</h3>
                  <p className="settings-desc">开启后记录最近 20 条剪贴板文本。自动过滤信用卡号、身份证号、API Key 等敏感信息。仅存储在内存中，应用关闭后清除。</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={draft.clipboardHistoryEnabled}
                    onChange={(e) => void toggleAndSave({ clipboardHistoryEnabled: e.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </section>

            {/* 全局热键 */}
            <section className="settings-section">
              <div className="settings-toggle-row">
                <div>
                  <h3>⌨️ 全局热键</h3>
                  <p className="settings-desc">设置唤起/隐藏主窗口的全局快捷键。格式：Cmd+Option+D、Ctrl+Shift+P 等。</p>
                </div>
              </div>
              <div className="settings-field">
                <label>热键组合</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Cmd+Option+D"
                    value={draft.hotkey}
                    onChange={(e) => updateDraft({ hotkey: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="settings-btn-secondary"
                    onClick={() => {
                      updateDraft({ hotkey: "Cmd+Option+D" });
                    }}
                    title="恢复默认热键"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    恢复默认
                  </button>
                </div>
                <p className="settings-hint">
                  支持的修饰键：Cmd/Command/Meta, Ctrl/Control, Alt/Option, Shift
                  <br />
                  支持的按键：A-Z, 0-9, F1-F12, Space, Enter, Esc, Tab, 方向键等
                </p>
              </div>
            </section>

            {/* 应用锁屏 */}
            <section className="settings-section">
              <div className="settings-toggle-row">
                <div>
                  <h3>🔒 应用锁屏</h3>
                  <p className="settings-desc">启用后，应用启动时或空闲一段时间后自动锁定，需要输入密码才能解锁，保护您的隐私。</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={draft.lockEnabled}
                    onChange={(e) => void toggleAndSave({ lockEnabled: e.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              {draft.lockEnabled && (
                <>
                  <div className="settings-field">
                    <label>锁屏密码</label>
                    <input
                      type="password"
                      placeholder="请输入锁屏密码"
                      value={draft.lockPassword}
                      onChange={(e) => updateDraft({ lockPassword: e.target.value })}
                    />
                    <p className="settings-hint">设置后，应用锁定时需要输入此密码才能解锁。请牢记密码，忘记后无法找回。</p>
                  </div>
                  <div className="settings-field">
                    <label>自动锁定时间（分钟）</label>
                    <input
                      type="number"
                      placeholder="0 = 不自动锁定"
                      value={draft.autoLockMinutes}
                      onChange={(e) => updateDraft({ autoLockMinutes: parseInt(e.target.value) || 0 })}
                      min="0"
                      max="120"
                    />
                    <p className="settings-hint">设置为 0 表示不自动锁定，仅在应用启动时锁定。空闲时间从最后一次鼠标/键盘操作开始计算。</p>
                  </div>
                  <div className="settings-field">
                    <button
                      className="settings-btn-secondary"
                      onClick={() => {
                        // 发送锁屏事件，立即锁定应用
                        import("@tauri-apps/api/event").then(({ emit }) => {
                          emit("lock-screen", {});
                        });
                      }}
                      style={{ width: "100%" }}
                    >
                      🔒 立即锁定应用
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* 密码箱主密码 */}
            <section className="settings-section">
              <div className="settings-toggle-row">
                <div>
                  <h3>🔐 密码箱主密码</h3>
                  <p className="settings-desc">为密码箱设置主密码，启用后访问密码箱内容需要输入主密码，进一步增强您的敏感信息安全。</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={draft.masterPasswordEnabled}
                    onChange={(e) => void toggleAndSave({ masterPasswordEnabled: e.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              {draft.masterPasswordEnabled && (
                <>
                  <div className="settings-field">
                    <label>主密码</label>
                    <input
                      type="password"
                      placeholder="请输入主密码"
                      value={draft.masterPassword}
                      onChange={(e) => updateDraft({ masterPassword: e.target.value })}
                    />
                    <p className="settings-hint">设置后，访问密码箱内容需要输入此密码。请牢记主密码，忘记后无法找回已加密的内容。</p>
                  </div>
                  <div className="settings-field">
                    <label>确认主密码</label>
                    <input
                      type="password"
                      placeholder="请再次输入主密码"
                      value={confirmMasterPassword}
                      onChange={(e) => setConfirmMasterPassword(e.target.value)}
                    />
                  </div>
                  {masterPasswordError && <p className="settings-error">{masterPasswordError}</p>}
                </>
              )}
            </section>

            {/* 系统钥匙串存储 */}
            <section className="settings-section">
              <div className="settings-toggle-row">
                <div>
                  <h3>🔑 系统钥匙串存储</h3>
                  <p className="settings-desc">启用后，API Key 等敏感信息将存储在 macOS 系统钥匙串中，而不是本地配置文件，提供更高的安全性。</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={draft.useKeychain}
                    onChange={(e) => void toggleAndSave({ useKeychain: e.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              {draft.useKeychain && (
                <div className="settings-hint-box">
                  <p className="settings-hint">
                    ✅ 已启用系统钥匙串存储。API Key 将在保存设置时自动迁移到系统钥匙串。
                  </p>
                  <p className="settings-hint">
                    ⚠️ 注意：首次启用时，系统可能会弹出钥匙串访问权限提示，请选择"始终允许"。
                  </p>
                </div>
              )}
            </section>

            {/* 自定义配置（密码管理） */}
            <CustomItemsManager
              masterPasswordEnabled={draft.masterPasswordEnabled}
              masterPassword={draft.masterPassword}
            />

            {/* 数据管理 */}
            <section className="settings-section">
              <h3>💾 数据管理</h3>
              <p className="settings-desc">管理您的本地数据，包括设置、密码箱、localStorage 等。所有数据仅存储在本地，不会上传到任何服务器。</p>

              {/* 数据存储信息 */}
              <div className="data-storage-info">
                <div className="storage-item">
                  <span className="storage-label">localStorage 条目</span>
                  <span className="storage-value">{storageInfo.localStorageCount} 条</span>
                </div>
                <div className="storage-item">
                  <span className="storage-label">localStorage 大小</span>
                  <span className="storage-value">{(storageInfo.localStorageSize / 1024).toFixed(2)} KB</span>
                </div>
                <div className="storage-item">
                  <span className="storage-label">密码箱条目</span>
                  <span className="storage-value">{storageInfo.customItemsCount} 条</span>
                </div>
              </div>

              {/* 导出数据 */}
              <div className="data-action-row">
                <div className="data-action-info">
                  <h4>📤 导出数据</h4>
                  <p>导出所有设置、密码箱和 localStorage 数据为 JSON 文件，用于备份或迁移。</p>
                </div>
                <button
                  className="data-action-btn export-btn"
                  onClick={() => void handleExport()}
                  disabled={exporting}
                >
                  {exporting ? "导出中..." : "导出数据"}
                </button>
              </div>

              {/* 清除所有数据 */}
              <div className="data-action-row danger">
                <div className="data-action-info">
                  <h4>🗑️ 清除所有数据</h4>
                  <p>清除所有设置、密码箱和 localStorage 数据。此操作不可恢复，请谨慎操作！</p>
                  <div className="clear-confirm-input">
                    <input
                      type="text"
                      placeholder='输入 "DELETE" 确认'
                      value={clearConfirm}
                      onChange={(e) => setClearConfirm(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  className="data-action-btn clear-btn"
                  onClick={() => void handleClearAll()}
                  disabled={clearing || clearConfirm !== "DELETE"}
                >
                  {clearing ? "清除中..." : "清除所有数据"}
                </button>
              </div>
            </section>

            {/* 内置 LLM */}
            <section className="settings-section">
              <h3>🤖 内置 LLM</h3>
              <p className="settings-desc">OpenAI 兼容 API，任何支持该格式的服务都可以用。留空则使用 .env 中的配置。</p>
              <div className="settings-field">
                <label>API 地址 {!draft.builtin.baseUrl && effective.builtinBase && <span className="settings-effective">当前生效：{effective.builtinBase}</span>}</label>
                <input
                  type="text"
                  placeholder={effective.builtinBase || "https://api.example.com/v1"}
                  value={draft.builtin.baseUrl}
                  onChange={(e) => updateDraft({ builtin: { ...draft.builtin, baseUrl: e.target.value } })}
                  className={
                    draft.builtin.baseUrl && !validateUrl(draft.builtin.baseUrl).valid
                      ? "input-error"
                      : draft.builtin.baseUrl && !validateUrl(draft.builtin.baseUrl).isHttps && !validateUrl(draft.builtin.baseUrl).isLocalhost
                      ? "input-warning"
                      : ""
                  }
                />
                {draft.builtin.baseUrl && validateUrl(draft.builtin.baseUrl).error && (
                  <div className="url-validation error">{validateUrl(draft.builtin.baseUrl).error}</div>
                )}
                {draft.builtin.baseUrl && !validateUrl(draft.builtin.baseUrl).error && validateUrl(draft.builtin.baseUrl).warning && (
                  <div className="url-validation warning">{validateUrl(draft.builtin.baseUrl).warning}</div>
                )}
              </div>
              <div className="settings-field">
                <label>API Key {!draft.builtin.apiKey && effective.builtinApiKey && <span className="settings-effective">已配置（.env）</span>}</label>
                <input
                  type="password"
                  placeholder={effective.builtinApiKey ? "已配置（.env），留空继续使用" : "sk-..."}
                  value={draft.builtin.apiKey}
                  onChange={(e) => updateDraft({ builtin: { ...draft.builtin, apiKey: e.target.value } })}
                />
              </div>
              <div className="settings-field">
                <label>模型名 {!draft.builtin.model && effective.builtinModel && <span className="settings-effective">当前生效：{effective.builtinModel}</span>}</label>
                <input
                  type="text"
                  placeholder={effective.builtinModel || "deepseek-chat / gpt-4o / qwen-turbo"}
                  value={draft.builtin.model}
                  onChange={(e) => updateDraft({ builtin: { ...draft.builtin, model: e.target.value } })}
                />
              </div>
            </section>

            {/* Resolve Studio */}
            <section className="settings-section">
              <h3>⚡ Resolve Studio</h3>
              <p className="settings-desc">Cordis agent 运行时，工具调用 + 沙箱。留空则使用 .env 中的配置。</p>
              <div className="settings-field">
                <label>后端地址 {!draft.resolve.baseUrl && effective.resolveBase && <span className="settings-effective">当前生效：{effective.resolveBase}</span>}</label>
                <input
                  type="text"
                  placeholder={effective.resolveBase || "http://127.0.0.1:8787"}
                  value={draft.resolve.baseUrl}
                  onChange={(e) => updateDraft({ resolve: { baseUrl: e.target.value } })}
                  className={
                    draft.resolve.baseUrl && !validateUrl(draft.resolve.baseUrl).valid
                      ? "input-error"
                      : draft.resolve.baseUrl && !validateUrl(draft.resolve.baseUrl).isHttps && !validateUrl(draft.resolve.baseUrl).isLocalhost
                      ? "input-warning"
                      : ""
                  }
                />
                {draft.resolve.baseUrl && validateUrl(draft.resolve.baseUrl).error && (
                  <div className="url-validation error">{validateUrl(draft.resolve.baseUrl).error}</div>
                )}
                {draft.resolve.baseUrl && !validateUrl(draft.resolve.baseUrl).error && validateUrl(draft.resolve.baseUrl).warning && (
                  <div className="url-validation warning">{validateUrl(draft.resolve.baseUrl).warning}</div>
                )}
              </div>
            </section>

            {/* Spring Harness */}
            <section className="settings-section">
              <h3>🌱 Spring Harness</h3>
              <p className="settings-desc">Spring AI Agent，ReAct 推理，SSE 流式。留空则使用 .env 中的配置。</p>
              <div className="settings-field">
                <label>后端地址 {!draft.spring.baseUrl && effective.springBase && <span className="settings-effective">当前生效：{effective.springBase}</span>}</label>
                <input
                  type="text"
                  placeholder={effective.springBase || "http://127.0.0.1:8080"}
                  value={draft.spring.baseUrl}
                  onChange={(e) => updateDraft({ spring: { ...draft.spring, baseUrl: e.target.value } })}
                  className={
                    draft.spring.baseUrl && !validateUrl(draft.spring.baseUrl).valid
                      ? "input-error"
                      : draft.spring.baseUrl && !validateUrl(draft.spring.baseUrl).isHttps && !validateUrl(draft.spring.baseUrl).isLocalhost
                      ? "input-warning"
                      : ""
                  }
                />
                {draft.spring.baseUrl && validateUrl(draft.spring.baseUrl).error && (
                  <div className="url-validation error">{validateUrl(draft.spring.baseUrl).error}</div>
                )}
                {draft.spring.baseUrl && !validateUrl(draft.spring.baseUrl).error && validateUrl(draft.spring.baseUrl).warning && (
                  <div className="url-validation warning">{validateUrl(draft.spring.baseUrl).warning}</div>
                )}
              </div>
              <div className="settings-field">
                <label>默认模型 {!draft.spring.model && effective.springModel && <span className="settings-effective">当前生效：{effective.springModel}</span>}</label>
                <input
                  type="text"
                  placeholder={effective.springModel || "模型名"}
                  value={draft.spring.model}
                  onChange={(e) => updateDraft({ spring: { ...draft.spring, model: e.target.value } })}
                />
              </div>
            </section>

            {/* Resolve Harness */}
            <section className="settings-section">
              <h3>🔧 Resolve Harness</h3>
              <p className="settings-desc">同步问答 + 工具 trace。留空则使用 .env 中的配置。</p>
              <div className="settings-field">
                <label>后端地址 {!draft.harness.baseUrl && effective.harnessBase && <span className="settings-effective">当前生效：{effective.harnessBase}</span>}</label>
                <input
                  type="text"
                  placeholder={effective.harnessBase || "http://127.0.0.1:8899"}
                  value={draft.harness.baseUrl}
                  onChange={(e) => updateDraft({ harness: { ...draft.harness, baseUrl: e.target.value } })}
                  className={
                    draft.harness.baseUrl && !validateUrl(draft.harness.baseUrl).valid
                      ? "input-error"
                      : draft.harness.baseUrl && !validateUrl(draft.harness.baseUrl).isHttps && !validateUrl(draft.harness.baseUrl).isLocalhost
                      ? "input-warning"
                      : ""
                  }
                />
                {draft.harness.baseUrl && validateUrl(draft.harness.baseUrl).error && (
                  <div className="url-validation error">{validateUrl(draft.harness.baseUrl).error}</div>
                )}
                {draft.harness.baseUrl && !validateUrl(draft.harness.baseUrl).error && validateUrl(draft.harness.baseUrl).warning && (
                  <div className="url-validation warning">{validateUrl(draft.harness.baseUrl).warning}</div>
                )}
              </div>
              <div className="settings-field">
                <label>API Token {!draft.harness.apiToken && effective.harnessToken && <span className="settings-effective">已配置（.env）</span>}</label>
                <input
                  type="password"
                  placeholder={effective.harnessToken ? "已配置（.env），留空继续使用" : "访问令牌（可选）"}
                  value={draft.harness.apiToken}
                  onChange={(e) => updateDraft({ harness: { ...draft.harness, apiToken: e.target.value } })}
                />
              </div>
              <div className="settings-field">
                <label>默认模型 {!draft.harness.model && effective.harnessModel && <span className="settings-effective">当前生效：{effective.harnessModel}</span>}</label>
                <input
                  type="text"
                  placeholder={effective.harnessModel || "模型名"}
                  value={draft.harness.model}
                  onChange={(e) => updateDraft({ harness: { ...draft.harness, model: e.target.value } })}
                />
              </div>
            </section>
          </>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="settings-footer">
        <span className={`settings-save-status ${saved ? "saved" : ""}`}>
          {saving ? "保存中..." : saved ? "✓ 已保存" : saveError ? `✗ ${saveError}` : ""}
        </span>
        <div className="settings-buttons">
          <button className="settings-btn secondary" onClick={onClose}>
            取消
          </button>
          <button className="settings-btn primary" onClick={() => void handleSave()} disabled={saving || !loaded}>
            {saving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </div>
    </section>
  );
}

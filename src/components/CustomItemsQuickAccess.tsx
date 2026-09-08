import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useCustomItems, type CustomItem } from "../hooks/useCustomItems";
import "./CustomItemsQuickAccess.css";

/**
 * 首页自定义配置快速访问组件
 * 以网格形式展示自定义配置项，点击即可复制内容到剪贴板
 * 支持主密码验证：如果启用了主密码，需要验证后才能访问内容
 */
export function CustomItemsQuickAccess({
  masterPasswordEnabled = false,
  masterPassword = "",
}: {
  masterPasswordEnabled?: boolean;
  masterPassword?: string;
}) {
  const { items, getContent, unlocked, unlock } = useCustomItems(masterPasswordEnabled, masterPassword);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // 复制内容到剪贴板（设置忽略时间窗口，避免密码出现在剪贴板历史）
  const handleCopy = async (id: string, content: string) => {
    if (!content) return;
    // 设置忽略时间窗口（1秒内），剪贴板历史 hook 会忽略这段时间内的变化
    (window as unknown as { __skipClipboardUntil?: number }).__skipClipboardUntil = Date.now() + 1000;
    await writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 点击配置项：先解密内容，然后复制
  const handleItemClick = async (item: CustomItem) => {
    // 如果启用了主密码且未解锁，显示密码输入框
    if (masterPasswordEnabled && !unlocked) {
      setShowPasswordInput(true);
      return;
    }
    const content = await getContent(item);
    await handleCopy(item.id, content);
  };

  // 处理主密码解锁
  const handleUnlock = () => {
    if (unlock(passwordInput)) {
      setPasswordInput("");
      setPasswordError("");
      setShowPasswordInput(false);
    } else {
      setPasswordError("主密码错误，请重试");
    }
  };

  // 如果没有配置项，不显示
  if (items.length === 0) return null;

  return (
    <section className="custom-items-quick">
      <div className="link-group">
        <div className="link-group-label">
          🔐 密码箱
          {masterPasswordEnabled && !unlocked && (
            <span className="lock-indicator" title="已锁定，点击任意按钮解锁">🔒</span>
          )}
        </div>

        {/* 主密码输入框 */}
        {showPasswordInput && masterPasswordEnabled && !unlocked && (
          <div className="quick-password-input">
            <input
              type="password"
              placeholder="输入主密码"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setPasswordError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUnlock();
                if (e.key === "Escape") {
                  setShowPasswordInput(false);
                  setPasswordInput("");
                  setPasswordError("");
                }
              }}
              className="quick-password-field"
              autoFocus
            />
            <button className="quick-password-unlock-btn" onClick={handleUnlock}>
              解锁
            </button>
            <button
              className="quick-password-cancel-btn"
              onClick={() => {
                setShowPasswordInput(false);
                setPasswordInput("");
                setPasswordError("");
              }}
            >
              取消
            </button>
            {passwordError && <p className="quick-password-error">{passwordError}</p>}
          </div>
        )}

        <div className="link-grid">
          {items.map((item) => (
            <button
              key={item.id}
              className={`link-btn custom-item-btn ${copiedId === item.id ? "copied" : ""}`}
              onClick={() => void handleItemClick(item)}
              title={masterPasswordEnabled && !unlocked ? "点击解锁密码箱" : "点击复制内容"}
            >
              {copiedId === item.id && <span className="copy-check">✓</span>}
              {masterPasswordEnabled && !unlocked ? "🔒 " + item.label : item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

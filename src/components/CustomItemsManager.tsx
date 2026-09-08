import { useEffect, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useCustomItems, type CustomItem } from "../hooks/useCustomItems";
import "./CustomItemsManager.css";

/**
 * 自定义配置项管理组件
 * 用于存储密码等敏感信息，内容加密存储在 localStorage
 * 点击按钮文案可复制内容到剪贴板（不记录到剪贴板历史）
 * 支持主密码验证：如果启用了主密码，需要验证后才能访问内容
 */
export function CustomItemsManager({
  masterPasswordEnabled = false,
  masterPassword = "",
}: {
  masterPasswordEnabled?: boolean;
  masterPassword?: string;
}) {
  const { items, add, update, remove, getContent, unlocked, unlock, lock } = useCustomItems(
    masterPasswordEnabled,
    masterPassword,
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newContent, setNewContent] = useState("");
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // 复制内容到剪贴板（设置忽略时间窗口，避免密码出现在剪贴板历史）
  const handleCopy = async (item: CustomItem) => {
    const content = await getContent(item);
    if (!content) return;
    // 设置忽略时间窗口（1秒内），剪贴板历史 hook 会忽略这段时间内的变化
    (window as unknown as { __skipClipboardUntil?: number }).__skipClipboardUntil = Date.now() + 1000;
    await writeText(content);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 切换内容显示/隐藏
  const toggleVisible = (id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 添加新配置项
  const handleAdd = async () => {
    if (!newLabel.trim() || !newContent) return;
    await add(newLabel, newContent);
    setNewLabel("");
    setNewContent("");
    setShowAddForm(false);
  };

  // 开始编辑
  const startEdit = async (item: CustomItem) => {
    const content = await getContent(item);
    setEditingId(item.id);
    setNewLabel(item.label);
    setNewContent(content);
    setShowAddForm(true);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingId || !newLabel.trim() || !newContent) return;
    await update(editingId, newLabel, newContent);
    setEditingId(null);
    setNewLabel("");
    setNewContent("");
    setShowAddForm(false);
  };

  // 取消编辑/添加
  const handleCancel = () => {
    setEditingId(null);
    setNewLabel("");
    setNewContent("");
    setShowAddForm(false);
  };

  // 处理主密码解锁
  const handleUnlock = () => {
    if (unlock(passwordInput)) {
      setPasswordInput("");
      setPasswordError("");
    } else {
      setPasswordError("主密码错误，请重试");
    }
  };

  // 处理锁定密码箱
  const handleLock = () => {
    lock();
    setPasswordInput("");
    setPasswordError("");
  };

  return (
    <section className="custom-items-section">
      <div className="custom-items-header">
        <h3>🔐 自定义配置</h3>
        <div style={{ display: "flex", gap: "8px" }}>
          {masterPasswordEnabled && unlocked && (
            <button
              className="custom-items-add-btn"
              onClick={handleLock}
              style={{ background: "#f5f5f5", color: "#666" }}
            >
              🔒 锁定
            </button>
          )}
          {(!masterPasswordEnabled || unlocked) && (
            <button
              className="custom-items-add-btn"
              onClick={() => setShowAddForm(true)}
              disabled={showAddForm}
            >
              + 添加
            </button>
          )}
        </div>
      </div>
      <p className="settings-desc">
        存储密码等敏感信息，内容加密存储在本地 localStorage，点击按钮文案可复制内容。
        {masterPasswordEnabled && " 已启用主密码保护。"}
      </p>

      {/* 主密码验证界面 */}
      {masterPasswordEnabled && !unlocked && (
        <div className="master-password-lock">
          <div className="master-password-icon">🔒</div>
          <h4>密码箱已锁定</h4>
          <p>请输入主密码以访问密码箱内容</p>
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
            }}
            className="master-password-input"
          />
          {passwordError && <p className="master-password-error">{passwordError}</p>}
          <button className="master-password-unlock-btn" onClick={handleUnlock}>
            解锁
          </button>
        </div>
      )}

      {/* 添加/编辑表单 */}
      {(!masterPasswordEnabled || unlocked) && showAddForm && (
        <div className="custom-items-form">
          <div className="settings-field">
            <label>按钮文案</label>
            <input
              type="text"
              placeholder="如：GitHub 密码"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="settings-field">
            <label>内容（加密存储）</label>
            <input
              type="password"
              placeholder="输入密码或敏感信息"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
            />
          </div>
          <div className="custom-items-form-actions">
            <button className="settings-btn secondary" onClick={handleCancel}>
              取消
            </button>
            <button
              className="settings-btn primary"
              onClick={() => void (editingId ? handleSaveEdit() : handleAdd())}
              disabled={!newLabel.trim() || !newContent}
            >
              {editingId ? "保存" : "添加"}
            </button>
          </div>
        </div>
      )}

      {/* 配置项列表（仅在解锁状态下显示） */}
      {(!masterPasswordEnabled || unlocked) && (
        <div className="custom-items-list">
          {items.length === 0 && !showAddForm && (
            <div className="custom-items-empty">暂无配置，点击"添加"创建</div>
          )}
          {items.map((item) => (
          <div key={item.id} className="custom-item">
            {/* 按钮文案（点击复制） */}
            <button
              className={`custom-item-label ${copiedId === item.id ? "copied" : ""}`}
              onClick={() => void handleCopy(item)}
              title="点击复制内容"
            >
              {copiedId === item.id ? "✓ 已复制" : item.label}
            </button>

            {/* 内容（默认掩码，点击眼睛显示/隐藏） */}
            <span className="custom-item-content">
              {visibleIds.has(item.id) ? (
                <span className="custom-item-content-plain">
                  {/* 解密后的内容在点击眼睛时才显示，这里用占位符 */}
                  <DecryptedContent item={item} getContent={getContent} />
                </span>
              ) : (
                <span className="custom-item-content-masked">••••••••</span>
              )}
            </span>

            {/* 操作按钮 */}
            <div className="custom-item-actions">
              <button
                className="custom-item-action-btn"
                onClick={() => toggleVisible(item.id)}
                title={visibleIds.has(item.id) ? "隐藏" : "显示"}
              >
                {visibleIds.has(item.id) ? "🙈" : "👁"}
              </button>
              <button
                className="custom-item-action-btn"
                onClick={() => void startEdit(item)}
                title="编辑"
              >
                ✏️
              </button>
              <button
                className="custom-item-action-btn delete"
                onClick={() => remove(item.id)}
                title="删除"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
        </div>
      )}
    </section>
  );
}

/** 解密内容组件（只在需要显示时才解密） */
function DecryptedContent({
  item,
  getContent,
}: {
  item: CustomItem;
  getContent: (item: CustomItem) => Promise<string>;
}) {
  const [content, setContent] = useState<string>("...");

  useEffect(() => {
    let alive = true;
    void getContent(item).then((c) => {
      if (alive) setContent(c);
    });
    return () => {
      alive = false;
    };
  }, [item, getContent]);

  return <span>{content}</span>;
}

import { useState, useEffect, useRef } from "react";
import { verifyPassword } from "../utils/crypto";
import "./LockScreen.css";

interface LockScreenProps {
  password: string;
  appTitle: string;
  onUnlock: () => void;
}

/**
 * 锁屏组件：显示锁屏界面，要求输入密码才能解锁。
 * 锁屏时隐藏所有敏感内容，保护用户隐私。
 * 密码以 PBKDF2 哈希形式持久化，校验时对输入做同样的哈希后比对。
 */
export default function LockScreen({ password, appTitle, onUnlock }: LockScreenProps) {
  const [inputPassword, setInputPassword] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦密码输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleUnlock = async () => {
    if (!password || checking) return;
    setChecking(true);
    const ok = await verifyPassword(inputPassword, password);
    setChecking(false);
    if (ok) {
      setError("");
      onUnlock();
    } else {
      setError("密码错误，请重试");
      setShake(true);
      setInputPassword("");
      setTimeout(() => setShake(false), 500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleUnlock();
    }
  };

  return (
    <div className={`lock-screen ${shake ? "shake" : ""}`}>
      <div className="lock-content">
        <div className="lock-icon">🔒</div>
        <h2 className="lock-title">{appTitle} 已锁定</h2>
        <p className="lock-desc">请输入密码以解锁</p>
        <div className="lock-input-wrapper">
          <input
            ref={inputRef}
            type="password"
            className="lock-input"
            placeholder="输入密码"
            value={inputPassword}
            disabled={checking}
            onChange={(e) => {
              setInputPassword(e.target.value);
              setError("");
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        {error && <p className="lock-error">{error}</p>}
        <button className="lock-unlock-btn" onClick={handleUnlock} disabled={checking}>
          {checking ? "验证中…" : "解锁"}
        </button>
      </div>
    </div>
  );
}

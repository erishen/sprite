import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initLogger } from "./utils/logger";

// 初始化日志脱敏（生产环境自动启用，开发环境不启用）
initLogger();

/** 兜底：渲染异常时显示可恢复提示，而不是整窗白屏。 */
class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            color: "#f2a0a2",
            padding: 16,
            background: "rgba(20,24,42,0.9)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div>界面渲染出错了：{String(this.state.error)}</div>
          <button
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid rgba(165,180,252,0.4)",
              background: "rgba(99,102,241,0.35)",
              color: "#eef2ff",
              cursor: "pointer",
            }}
            onClick={() => this.setState({ error: null })}
          >
            恢复
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
);

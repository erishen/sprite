import type { ToastItem, ToastType } from "../hooks/useToast";

/** Toast 图标 */
const TOAST_ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
};

/** Toast 颜色 */
const TOAST_COLORS: Record<ToastType, string> = {
  success: "#52C41A",
  error: "#EA6668",
  warning: "#FAAD14",
  info: "#8BC8EA",
};

/** 单个 Toast 组件 */
export function Toast({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  const color = TOAST_COLORS[item.type];
  const icon = TOAST_ICONS[item.type];

  return (
    <div
      className="toast-item"
      style={{
        borderLeft: `3px solid ${color}`,
      }}
    >
      <span className="toast-icon" style={{ color }}>
        {icon}
      </span>
      <span className="toast-message">{item.message}</span>
      <button className="toast-close" onClick={() => onClose(item.id)} title="关闭">
        ×
      </button>
    </div>
  );
}

/** Toast 容器组件，显示所有 toast */
export function ToastContainer({
  toasts,
  onClose,
}: {
  toasts: ToastItem[];
  onClose: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((item) => (
        <Toast key={item.id} item={item} onClose={onClose} />
      ))}
    </div>
  );
}

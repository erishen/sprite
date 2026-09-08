/** 示例问题项 */
export interface PanelExample {
  text: string;
  hint?: string;
}

/** ExampleChips 组件属性 */
export interface ExampleChipsProps {
  examples: PanelExample[];
  onSelect: (text: string) => void;
  variant?: "default" | "compact" | "followup";
}

/**
 * 示例问题标签组件：展示可点击的示例问题标签。
 */
export function ExampleChips({ examples, onSelect, variant = "default" }: ExampleChipsProps) {
  if (examples.length === 0) return null;

  return (
    <div className={`example-chips ${variant === "compact" ? "example-chips-compact" : ""}`}>
      {examples.map((ex, i) => (
        <button
          key={`${ex.text}-${i}`}
          className="example-chip"
          onClick={() => onSelect(ex.text)}
          title={ex.hint}
        >
          {ex.text}
        </button>
      ))}
    </div>
  );
}

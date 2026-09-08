import { useCallback, useEffect, useState } from "react";

/**
 * 示例问题 hook：管理示例问题列表，支持随机选择、点击填充等。
 * @param questions 示例问题列表
 * @param onSelect 选择示例问题的回调函数
 */
export function useExampleQuestions(
  questions: string[],
  onSelect?: (question: string) => void,
) {
  const [currentQuestions, setCurrentQuestions] = useState<string[]>([]);
  const [usedQuestions, setUsedQuestions] = useState<Set<string>>(new Set());

  /** 随机选择示例问题（避免重复） */
  const shuffleQuestions = useCallback(() => {
    if (questions.length === 0) {
      setCurrentQuestions([]);
      return;
    }

    // 优先选择未使用过的问题
    const unused = questions.filter((q) => !usedQuestions.has(q));
    const pool = unused.length > 0 ? unused : questions;

    // 随机打乱并取前 4 个
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(4, shuffled.length));

    setCurrentQuestions(selected);
    setUsedQuestions((prev) => {
      const next = new Set(prev);
      selected.forEach((q) => next.add(q));
      // 如果所有问题都用过了，重置
      if (next.size >= questions.length) {
        return new Set();
      }
      return next;
    });
  }, [questions, usedQuestions]);

  /** 选择示例问题 */
  const selectQuestion = useCallback(
    (question: string) => {
      onSelect?.(question);
    },
    [onSelect],
  );

  /** 初始化时随机选择示例问题 */
  useEffect(() => {
    shuffleQuestions();
  }, [shuffleQuestions]);

  return {
    questions: currentQuestions,
    shuffleQuestions,
    selectQuestion,
  };
}

/**
 * 提醒工具：声音提醒 + 系统通知。
 * 使用 Web Audio API 播放提示音，使用浏览器原生 Notification API 发送系统通知。
 */

let audioContext: AudioContext | null = null;

/** 获取或创建 AudioContext（懒加载，避免页面加载时就创建） */
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    try {
      const AudioContextCtor = window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;
      audioContext = new AudioContextCtor();
    } catch {
      return null;
    }
  }
  return audioContext;
}

/**
 * 播放提示音（"叮"的一声，双音叠加，清脆悦耳）。
 * @param duration 持续时间（秒），默认 0.3
 */
export function playDing(duration = 0.3): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // 恢复被浏览器挂起的 AudioContext（用户交互后才能播放声音）
  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const now = ctx.currentTime;

  // 第一个音：高频 880Hz（A5）
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(880, now);
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.3, now + 0.01);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + duration);

  // 第二个音：更高频 1320Hz（E6），延迟 50ms，形成"叮"的余韵
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1320, now + 0.05);
  gain2.gain.setValueAtTime(0, now + 0.05);
  gain2.gain.linearRampToValueAtTime(0.2, now + 0.06);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.1);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.05);
  osc2.stop(now + duration + 0.1);
}

/**
 * 请求系统通知权限（需要在用户交互时调用）。
 * @returns 是否获得权限
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

/**
 * 发送系统通知。
 * @param title 通知标题
 * @param body 通知内容
 * @param icon 图标（可选）
 */
export function sendNotification(title: string, body: string, icon?: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon, silent: false });
  } catch {
    // 忽略通知发送失败
  }
}

/**
 * 番茄钟结束提醒：播放声音 + 发送系统通知。
 * @param mode 结束的模式（work = 专注结束，break = 休息结束）
 */
export function pomodoroReminder(mode: "work" | "break"): void {
  const isWorkEnd = mode === "work";
  const title = isWorkEnd ? "专注时间到！" : "休息时间到！";
  const body = isWorkEnd
    ? "辛苦了，休息一下吧！"
    : "休息结束，开始专注吧！";

  // 播放提示音（连续两声，更醒目）
  playDing(0.3);
  setTimeout(() => playDing(0.3), 400);

  // 发送系统通知
  sendNotification(title, body);
}

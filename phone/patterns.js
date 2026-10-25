// The vibration language. Each step is [delayMs, action]; on iOS Vibration.vibrate() is a fixed ~400 ms buzz.
import { Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

const buzz = () => Vibration.vibrate();
const heavy = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
const error = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

export const PATTERNS = {
  warning: { label: 'Warning', hint: 'one long buzz', color: '#f3b34f', repeatMs: 3000, steps: [[0, buzz]] },
  dangerTaps: { label: 'Danger A', hint: 'triple heavy tap', color: '#e76d65', repeatMs: 1000, steps: [[0, heavy], [120, heavy], [240, heavy]] },
  danger: { label: 'Danger B', hint: 'triple long buzz', color: '#e76d65', repeatMs: 1500, steps: [[0, buzz], [450, buzz], [900, buzz]] },
  zone: { label: 'Zone entry', hint: 'error taps + buzz', color: '#c062e0', repeatMs: 2000, steps: [[0, error], [350, buzz]] },
  clear: { label: 'Clear', hint: 'one light tap', color: '#64d9a0', repeatMs: 3000, steps: [[0, light]] },
};

/** Plays a pattern once (or every repeatMs when repeat is true). Returns a cancel function. */
export function play(pattern, { repeat = false, delayMs = 0, forMs = Infinity } = {}) {
  const timers = [];
  const once = (offset) => pattern.steps.forEach(([delay, action]) => timers.push(setTimeout(action, offset + delay)));
  if (!repeat) once(delayMs);
  else {
    const runs = Number.isFinite(forMs) ? Math.ceil(forMs / pattern.repeatMs) : 1;
    for (let i = 0; i < runs; i += 1) once(delayMs + i * pattern.repeatMs);
    if (!Number.isFinite(forMs)) {
      timers.push(setTimeout(() => { const interval = setInterval(() => once(0), pattern.repeatMs); timers.push(interval); }, delayMs + pattern.repeatMs));
    }
  }
  return () => {
    timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
    Vibration.cancel();
  };
}

// 震动反馈：只在支持 navigator.vibrate 的设备（安卓）上生效；iOS Safari 不支持，设置页也不显示此项。
import { features } from './env';

let enabled = true;
export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

export function haptic(ms = 15) {
  if (!enabled || !features.vibrate) return;
  try {
    navigator.vibrate(Math.max(10, Math.min(20, ms)));
  } catch {
    /* 某些浏览器在无用户手势时会抛错，忽略 */
  }
}

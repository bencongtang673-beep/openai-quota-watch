// 运行环境检测与特性检测。所有较新的 API 都在这里集中探测，调用方只看布尔值。

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

export const isIOS: boolean =
  /iPad|iPhone|iPod/.test(ua) ||
  // iPadOS 13+ 桌面版 UA 伪装成 Mac
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);

export const isAndroid: boolean = /Android/i.test(ua);

/** 微信 / QQ 内置浏览器（含企业微信、QQ 内置 X5 内核）。QQ 浏览器(MQQBrowser)独立 App 不算。 */
export const isWeChat: boolean = /MicroMessenger/i.test(ua);
export const isQQInApp: boolean = /\bQQ\/[\d.]+/i.test(ua);
export const isInAppBrowser: boolean = isWeChat || isQQInApp;

/** iOS 上的非 Safari 浏览器（Chrome/Edge/Firefox for iOS），它们不能“添加到主屏幕”为独立 App（iOS 16.4 前）。 */
export const isIOSNonSafari: boolean = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mm || iosStandalone);
}

export const features = {
  vibrate: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && !isIOS,
  share: typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  clipboard: typeof navigator !== 'undefined' && !!navigator.clipboard && typeof navigator.clipboard.writeText === 'function',
  storagePersist: typeof navigator !== 'undefined' && !!navigator.storage && typeof navigator.storage.persist === 'function',
  serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  indexedDB: typeof indexedDB !== 'undefined',
  worker: typeof Worker !== 'undefined',
  audioSession:
    typeof navigator !== 'undefined' && !!(navigator as Navigator & { audioSession?: { type: string } }).audioSession,
  dvh: typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('height', '100dvh'),
  pointerEvents: typeof window !== 'undefined' && 'PointerEvent' in window,
};

/** 申请持久化存储（支持时）。返回最终是否持久化。 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!features.storagePersist) return null;
  try {
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

// Service Worker 注册与“下次启动生效”的更新流程。
//
// 规则：
//  - 新版本在后台安装完成后进入 waiting 状态，不打断当前使用；
//  - 应用启动时（尚未进入任何对局）若发现 waiting 版本，立即切换并刷新一次，随后轻提示“已更新”；
//  - 应用回到前台且当前位于首页（非对局中）时，同样可以切换；
//  - 对局中永远不刷新。
import { features } from './env';

const UPDATED_FLAG = 'sudoku.justUpdated';
const BUILD_ID = `${__APP_VERSION__}|${__BUILD_TIME__}|${__BUILD_TAG__}`;

type Guard = () => boolean; // 返回 true 表示当前可以安全刷新（不在对局中）

let registration: ServiceWorkerRegistration | null = null;
let canReload: Guard = () => false;
let reloading = false;

export function swBaseUrl(): string {
  return import.meta.env.BASE_URL;
}

export async function registerServiceWorker(guard: Guard): Promise<ServiceWorkerRegistration | null> {
  canReload = guard;
  if (!features.serviceWorker || import.meta.env.DEV) return null;
  const base = swBaseUrl();
  try {
    registration = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
  } catch (e) {
    console.warn('SW 注册失败', e);
    return null;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) {
      window.location.reload();
    }
  });
  // 启动时若已有等待中的新版本，立即应用（此时还没有进入对局）
  tryApplyWaiting();
  registration.addEventListener('updatefound', () => {
    const sw = registration?.installing;
    sw?.addEventListener('statechange', () => {
      // 安装完成后保持 waiting，等“下次启动”或回到首页再切换
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      registration?.update().catch(() => undefined);
      tryApplyWaiting();
    }
  });
  // 首次检查更新
  registration.update().catch(() => undefined);
  return registration;
}

export function tryApplyWaiting(): boolean {
  const waiting = registration?.waiting;
  if (!waiting || !navigator.serviceWorker.controller) return false;
  if (!canReload()) return false;
  reloading = true;
  try {
    // 记下“旧版本”的构建标识；只有换到不同构建的页面才会显示“已更新”
    localStorage.setItem(UPDATED_FLAG, BUILD_ID);
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }
  waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

/** 读取并清除“刚刚更新过”的标记，用于显示一次“已更新”轻提示。 */
export function consumeJustUpdated(): boolean {
  try {
    const v = localStorage.getItem(UPDATED_FLAG);
    if (!v || v === BUILD_ID) return false;
    localStorage.removeItem(UPDATED_FLAG);
    return true;
  } catch {
    return false;
  }
}

export async function getSwVersion(): Promise<string | null> {
  const ctrl = features.serviceWorker ? navigator.serviceWorker.controller : null;
  if (!ctrl) return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 1500);
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === 'VERSION') {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('message', onMsg);
        resolve(String(e.data.version));
      }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    ctrl.postMessage({ type: 'GET_VERSION' });
  });
}

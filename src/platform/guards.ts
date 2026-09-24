// 全局防误触：iOS Safari 双指缩放(gesturestart)、双击缩放、长按菜单。
import { isIOS } from './env';

export function installGlobalGuards() {
  if (typeof document === 'undefined') return;
  if (isIOS) {
    // iOS Safari 忽略 user-scalable=no，需要拦截私有的 gesture 事件
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stop, { passive: false } as AddEventListenerOptions);
    document.addEventListener('gesturechange', stop, { passive: false } as AddEventListenerOptions);
    document.addEventListener('gestureend', stop, { passive: false } as AddEventListenerOptions);
  }
  // 标记了 data-no-menu 的区域（盘面、按键）拦截长按菜单
  document.addEventListener('contextmenu', (e) => {
    const t = e.target as Element | null;
    if (t && t.closest && t.closest('[data-no-menu]')) e.preventDefault();
  });
}

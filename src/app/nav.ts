// 导航与返回键：打开弹窗/菜单/说明页/武士总览时 pushState；
// 返回（安卓返回键 / 浏览器后退）先关闭最上层界面；对局界面返回首页；只有首页按返回才真正退出。
// 每个历史条目记录 {screen, layers}，popstate 时按条目状态对齐界面（支持一次后退多层）。
import { app, emit, type Layer } from './store';

let installed = false;
let onLeaveGame: (() => void) | null = null;

interface NavState {
  sdk: 1;
  screen: 'home' | 'game';
  layers: number;
}

function push() {
  const st: NavState = { sdk: 1, screen: app.screen, layers: app.layers.length };
  try {
    history.pushState(st, '');
  } catch {
    /* 某些内嵌浏览器禁止修改历史，忽略 */
  }
}

export function installNav(leaveGame: () => void) {
  onLeaveGame = leaveGame;
  if (installed) return;
  installed = true;
  try {
    history.replaceState({ sdk: 1, screen: 'home', layers: 0 } satisfies NavState, '');
  } catch {
    /* 忽略 */
  }
  window.addEventListener('popstate', (e) => {
    if (pendingBacks > 0) pendingBacks--;
    try {
      handlePop(e);
    } finally {
      // 我们自己发起的“后退”完成后，再执行期间被推迟的打开操作
      if (pendingBacks === 0 && deferredOpens.length) deferredOpens.splice(0).forEach((l) => openLayer(l));
    }
  });
}

function handlePop(e: PopStateEvent) {
  {
    if (pendingEnterGame) {
      // 先把首页上的弹层条目退掉，再压入对局条目
      pendingEnterGame = false;
      app.layers = [];
      app.screen = 'game';
      push();
      emit();
      const q = settleQueue.splice(0);
      q.forEach((f) => f());
      return;
    }
    const st = e.state as NavState | null;
    const targetLayers = st && st.sdk === 1 ? st.layers : 0;
    const targetScreen = st && st.sdk === 1 ? st.screen : 'home';
    if (app.layers.length > targetLayers) app.layers = app.layers.slice(0, targetLayers);
    if (targetScreen === 'home' && app.screen === 'game') {
      onLeaveGame?.();
      app.screen = 'home';
      app.layers = [];
    }
    emit();
    const w = popWaiters.splice(0);
    w.forEach((f) => f());
  }
}

/** 由本应用发起、尚未收到 popstate 的后退次数 */
let pendingBacks = 0;
const deferredOpens: Layer[] = [];

function back(n = 1) {
  pendingBacks++;
  const mine = ++backSeq;
  if (n === 1) history.back();
  else history.go(-n);
  // 保险：若 1 秒内没收到 popstate（例如某些内嵌浏览器历史受限），不能让后续弹层永远被推迟
  setTimeout(() => {
    if (mine === backSeq && pendingBacks > 0) {
      pendingBacks = 0;
      deferredOpens.splice(0).forEach((l) => openLayer(l));
    }
  }, 1000);
}
let backSeq = 0;

export function openLayer(layer: Layer) {
  if (pendingBacks > 0) {
    deferredOpens.push(layer);
    return;
  }
  app.layers = [...app.layers, layer];
  push();
  emit();
}

const popWaiters: (() => void)[] = [];

/** 用户点“关闭”：走 history.back()，保持浏览器历史与界面同步 */
export function closeLayer() {
  if (!app.layers.length) return;
  back();
}

/** 关闭最上层，并在历史回退真正完成后执行 fn（避免与 popstate 竞争） */
export function closeLayerThen(fn: () => void) {
  if (!app.layers.length) return fn();
  popWaiters.push(fn);
  back();
}

/** 替换最上层（不增加历史条目） */
export function replaceLayer(layer: Layer) {
  if (!app.layers.length) return openLayer(layer);
  app.layers = [...app.layers.slice(0, -1), layer];
  emit();
}

/** 关闭全部层 */
export function closeAllLayers() {
  const n = app.layers.length;
  if (n) back(n);
}

let pendingEnterGame = false;
const settleQueue: (() => void)[] = [];

/** 导航（历史条目调整）完成后执行 */
export function whenNavSettled(fn: () => void) {
  if (pendingEnterGame) settleQueue.push(fn);
  else fn();
}

export function enterGameScreen() {
  if (app.screen === 'game') return;
  const n = app.layers.length;
  if (n) {
    // 进入对局前先把首页上的弹层条目全部退掉（popstate 回调里再压入对局条目）
    pendingEnterGame = true;
    app.screen = 'game';
    app.layers = [];
    emit();
    back(n);
    return;
  }
  app.screen = 'game';
  push();
  emit();
}

export function leaveGameScreen() {
  if (app.screen !== 'game') return;
  back();
}

export function topLayer(): Layer | undefined {
  return app.layers[app.layers.length - 1];
}

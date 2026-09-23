import { render } from 'preact';
import './app/base.css';
import './app/app.css';
import { App } from './app/App';
import { initApp, installGameLifecycle, onLeaveGame } from './app/actions';
import { installNav } from './app/nav';
import { installPoolLifecycle } from './app/pool';
import { app } from './app/store';
import { installAudioLifecycle } from './platform/audio';
import { installGlobalGuards } from './platform/guards';
import { initInstallPrompt } from './platform/install';
import { registerServiceWorker } from './platform/sw-register';

installGlobalGuards();
initInstallPrompt();
installAudioLifecycle();
installNav(onLeaveGame);
installGameLifecycle();
render(<App />, document.getElementById('app')!);
initApp().then(() => {
  installPoolLifecycle();
});
// 只有不在对局中时才允许切换到新版本（对局中绝不强制刷新）
registerServiceWorker(() => app.screen !== 'game' && app.layers.length === 0);

// 性能基准钩子（E2E 在 4 倍 CPU 降速下调用，用于记录出题耗时；界面不可见）
import { generate } from './engine/generate';
import type { Level, Mode } from './engine/types';
(window as unknown as { __sudokuBench: unknown }).__sudokuBench = (mode: Mode, level: Level, n: number, seed: number) => {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    const p = generate({ mode, level, seed: seed + i * 7919 });
    times.push(p ? performance.now() - t : -1);
  }
  return times;
};

// 测试钩子：强制主线程分片出题（模拟 Worker 不可用）、音效引擎
import { requestPuzzle } from './platform/generator-client';
import { sound } from './platform/audio';
(window as unknown as { __sudokuGenMain: unknown }).__sudokuGenMain = (mode: Mode, level: Level) =>
  requestPuzzle({ mode, level, timeLimitMs: 60_000 }, undefined, true).promise;
(window as unknown as { __sudokuSound: unknown }).__sudokuSound = sound;
import { stopPoolFilling } from './app/pool';
(window as unknown as { __sudokuStopPool: unknown }).__sudokuStopPool = stopPoolFilling;
import { generateIter } from './engine/generate';
(window as unknown as { __sudokuGenGaps: unknown }).__sudokuGenGaps = (mode: Mode, level: Level, seed: number) => {
  const it = generateIter({ mode, level, seed, fineSlices: true });
  const long: string[] = [];
  let last = performance.now();
  let lp = 'start';
  for (;;) {
    const r = it.next();
    const t = performance.now();
    if (t - last > 30) long.push(`${lp}→${r.done ? 'done' : r.value.phase}:${Math.round(t - last)}`);
    last = t;
    if (r.done) break;
    lp = r.value.phase;
  }
  return long;
};

// 题池：App 在前台空闲时预生成，每模式每档 2 道，存 IndexedDB，取出即作废。不依赖后台运行。
import { LEVELS, MODES, type Level, type Mode, type PuzzleData } from '../engine/types';
import { requestPuzzle } from '../platform/generator-client';
import { availableLevels } from './levels';
import { app, emit, persist } from './store';

export const POOL_PER_SLOT = 2;
const key = (m: Mode, l: Level) => `${m}-${l}`;

export async function refreshPoolCounts() {
  const db = app.db;
  if (!db) return;
  const items = await db.poolList();
  const counts: Record<string, number> = {};
  for (const it of items) counts[key(it.mode, it.level)] = (counts[key(it.mode, it.level)] ?? 0) + 1;
  app.poolCounts = counts;
  emit();
}

export async function takeFromPool(mode: Mode, level: Level): Promise<PuzzleData | null> {
  const db = app.db;
  if (!db) return null;
  const p = await db.poolTake(mode, level, app.fingerprints);
  await refreshPoolCounts();
  return p;
}

/** 预生成顺序：高难档优先（它们现场生成最慢） */
function slots(): [Mode, Level][] {
  const out: [Mode, Level][] = [];
  for (const level of [5, 4, 3, 2, 1] as Level[])
    for (const mode of MODES) if (availableLevels(mode).includes(level)) out.push([mode, level]);
  return out;
}

let stopped = false;
let running = false;
let currentCancel: (() => void) | null = null;

export function poolMissing(): number {
  let n = 0;
  for (const [m, l] of slots()) n += Math.max(0, POOL_PER_SLOT - (app.poolCounts[key(m, l)] ?? 0));
  return n;
}

export function startPoolFilling() {
  if (running || stopped || !app.db) return;
  if (document.visibilityState !== 'visible') return;
  running = true;
  const total = slots().length * POOL_PER_SLOT;
  const loop = async () => {
    while (!stopped && document.visibilityState === 'visible') {
      const next = slots().find(([m, l]) => (app.poolCounts[key(m, l)] ?? 0) < POOL_PER_SLOT);
      if (!next) break;
      const [mode, level] = next;
      app.pool = { running: true, mode, level, done: total - poolMissing(), total, cancel: stopPoolFilling };
      emit();
      const exclude = new Set(app.fingerprints);
      const h = requestPuzzle({ mode, level, exclude, timeLimitMs: 600_000 });
      currentCancel = h.cancel;
      let p: PuzzleData | null = null;
      try {
        p = await h.promise;
      } catch {
        p = null;
      }
      currentCancel = null;
      if (!p) break;
      await persist((db) =>
        db.poolPut({ key: `${mode}-${level}-${p!.fingerprint.slice(0, 16)}`, mode, level, puzzle: p!, createdAt: Date.now() }),
      );
      await refreshPoolCounts();
    }
    running = false;
    app.pool = { running: false, done: total - poolMissing(), total };
    emit();
  };
  loop();
}

export function stopPoolFilling() {
  stopped = true;
  currentCancel?.();
  currentCancel = null;
  app.pool = { ...app.pool, running: false, cancel: undefined };
  emit();
}

export function resumePoolFilling() {
  stopped = false;
  startPoolFilling();
}

export function isPoolStopped() {
  return stopped;
}

let lifecycle = false;
export function installPoolLifecycle() {
  if (lifecycle) return;
  lifecycle = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // 不依赖后台运行：页面隐藏就停下，回到前台再继续
      currentCancel?.();
    } else if (!stopped) setTimeout(startPoolFilling, 3000);
  });
  // 启动后稍等再开始，避免与首屏争抢
  setTimeout(startPoolFilling, 4000);
}

export const POOL_LEVELS = LEVELS;

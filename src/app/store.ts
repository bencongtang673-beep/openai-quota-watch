// 全局应用状态：极简订阅式 store（不引入额外状态库）。
import { useEffect, useReducer } from 'preact/hooks';
import type { Level, Mode } from '../engine/types';
import type { GameState } from '../game/game';
import type { Hint } from '../game/hint';
import { DB, type HistoryEntry } from '../platform/db';
import { DEFAULT_SETTINGS, type Settings } from './settings';

export type Layer =
  | { type: 'newgame'; mode?: Mode }
  | { type: 'unfinished' }
  | { type: 'history' }
  | { type: 'stats' }
  | { type: 'settings' }
  | { type: 'help'; section?: string }
  | { type: 'backup' }
  | { type: 'import' }
  | { type: 'menu' }
  | { type: 'rules'; mode: Mode; auto?: boolean }
  | { type: 'confirm'; title: string; message: string; ok: string; danger?: boolean; onOk: () => void }
  | { type: 'result' }
  | { type: 'generating' }
  | { type: 'overview' }
  | { type: 'install' }
  | { type: 'share'; code: string }
  | { type: 'pool' };

export interface Toast {
  id: number;
  text: string;
}

export interface GenStatus {
  mode: Mode;
  level: Level;
  startedAt: number;
  attempts: number;
  phase: string;
  cancel: () => void;
  error?: string;
}

export interface PoolStatus {
  running: boolean;
  mode?: Mode;
  level?: Level;
  done: number;
  total: number;
  cancel?: () => void;
}

export interface GameUI {
  selected: number | null;
  noteMode: boolean;
  /** 数字锁定模式：锁定的数字（null = 普通模式） */
  lockDigit: number | null;
  lockMode: boolean;
  paused: boolean;
  autoPaused: boolean;
  hint: Hint | null;
  hintStage: 0 | 1 | 2 | 3;
  pop: { cell: number; key: number } | null;
  ripple: { cells: number[]; origin: number; key: number } | null;
  winWave: number | null;
  lastResult?: { entry: HistoryEntry; newRecord: boolean; prevBest: number | null };
}

export const app = {
  ready: false,
  db: null as DB | null,
  dbError: null as string | null,
  settings: { ...DEFAULT_SETTINGS } as Settings,
  games: [] as GameState[],
  history: [] as HistoryEntry[],
  fingerprints: new Set<string>(),
  flags: {} as Record<string, boolean>,
  screen: 'home' as 'home' | 'game',
  current: null as GameState | null,
  layers: [] as Layer[],
  toasts: [] as Toast[],
  gen: null as GenStatus | null,
  pool: { running: false, done: 0, total: 0 } as PoolStatus,
  poolCounts: {} as Record<string, number>,
  ui: {
    selected: null,
    noteMode: false,
    lockDigit: null,
    lockMode: false,
    paused: false,
    autoPaused: false,
    hint: null,
    hintStage: 0,
    pop: null,
    ripple: null,
    winWave: null,
  } as GameUI,
  recovered: [] as string[],
  persisted: null as boolean | null,
};

type Listener = () => void;
const listeners = new Set<Listener>();
let scheduled = false;

/** 通知界面刷新（同一帧内合并） */
export function emit() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const l of listeners) l();
  });
}

export function useApp(): typeof app {
  const [, force] = useReducer((x: number, _a: void) => x + 1, 0);
  useEffect(() => {
    const l = () => force(undefined);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return app;
}

let toastSeq = 0;
export function toast(text: string, ms = 2200) {
  const t = { id: ++toastSeq, text };
  app.toasts = [...app.toasts, t];
  emit();
  setTimeout(() => {
    app.toasts = app.toasts.filter((x) => x.id !== t.id);
    emit();
  }, ms);
}

// ---------- 串行化写入队列：保证写入顺序，任何一次写入失败都会提示 ----------
let chain: Promise<unknown> = Promise.resolve();
export function persist<T>(fn: (db: DB) => Promise<T>): Promise<T | undefined> {
  const db = app.db;
  if (!db) return Promise.resolve(undefined);
  const p = chain.then(() => fn(db));
  chain = p.catch((e) => {
    console.error('保存失败', e);
    toast('保存失败：' + String((e as Error)?.message ?? e));
  });
  return p.catch(() => undefined);
}

/** 等待所有写入完成（测试与页面隐藏时用） */
export function flushWrites(): Promise<unknown> {
  return chain;
}

// 暴露给 E2E 测试
(globalThis as unknown as { __sudokuApp?: typeof app }).__sudokuApp = app;
(globalThis as unknown as { __sudokuFlush?: () => Promise<unknown> }).__sudokuFlush = flushWrites;

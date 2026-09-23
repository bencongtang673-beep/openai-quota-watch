// 应用动作：启动、开新局、对局操作、完成/失败/放弃、设置、分享、备份。
import { MODE_NAMES, LEVEL_NAMES, type Level, type Mode, type PuzzleData } from '../engine/types';
import {
  applyHintChanges,
  autoNotes,
  completedGroups,
  digitCounts,
  digitTotal,
  eraseCell,
  geometryOf,
  isFilled,
  isGiven,
  isSolvedByRules,
  newGame,
  redo,
  restart,
  setValue,
  toggleNote,
  undo,
  type Action,
  type GameState,
} from '../game/game';
import { computeHint } from '../game/hint';
import { sound } from '../platform/audio';
import { DB, type HistoryEntry } from '../platform/db';
import { features, requestPersistentStorage } from '../platform/env';
import { requestPuzzle } from '../platform/generator-client';
import { haptic, setHapticsEnabled } from '../platform/haptics';
import { closeLayer, enterGameScreen, leaveGameScreen, openLayer, replaceLayer, whenNavSettled } from './nav';
import { refreshPoolCounts, takeFromPool } from './pool';
import { mergeSettings, type Settings } from './settings';
import { app, emit, flushWrites, persist, toast } from './store';

// ---------- 启动 ----------
export async function initApp() {
  try {
    if (!features.indexedDB) throw new Error('此浏览器不支持 IndexedDB');
    app.db = await DB.open();
  } catch (e) {
    app.dbError = String((e as Error)?.message ?? e);
  }
  const db = app.db;
  if (db) {
    app.settings = mergeSettings(await db.getKV('settings'));
    app.flags = ((await db.getKV('flags')) as Record<string, boolean>) ?? {};
    const { games, recovered } = await db.loadGames();
    app.games = games.filter((g) => g.status === 'playing').sort((a, b) => b.updatedAt - a.updatedAt);
    app.recovered = recovered;
    app.history = await db.listHistory();
    app.fingerprints = new Set(await db.listFingerprints());
    await refreshPoolCounts();
  }
  applySettingsSideEffects();
  app.ready = true;
  emit();
  requestPersistentStorage().then((p) => {
    app.persisted = p;
    emit();
  });
  if (app.recovered.length) toast(`检测到 ${app.recovered.length} 个存档写入不完整，已恢复到上一份有效存档`, 4000);
}

export function applySettingsSideEffects() {
  const s = app.settings;
  const root = document.documentElement;
  const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelectorAll('meta[name="theme-color"]');
  meta.forEach((m) => m.setAttribute('content', dark ? '#141A24' : '#F5F0E6'));
  sound.enabled = s.sound;
  sound.setVolume(s.volume);
  setHapticsEnabled(s.vibrate);
}

export function updateSettings(patch: Partial<Settings>) {
  app.settings = { ...app.settings, ...patch };
  applySettingsSideEffects();
  const snapshot = { ...app.settings };
  persist((db) => db.setKV('settings', snapshot));
  emit();
}

export function setFlag(key: string, v = true) {
  app.flags = { ...app.flags, [key]: v };
  const snapshot = { ...app.flags };
  persist((db) => db.setKV('flags', snapshot));
  emit();
}

// ---------- 计时 ----------
let runningSince: number | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
let lastAutosave = 0;

export function elapsedNow(): number {
  const g = app.current;
  if (!g) return 0;
  return g.elapsedMs + (runningSince !== null ? performance.now() - runningSince : 0);
}

function startClock() {
  const g = app.current;
  if (!g || g.status !== 'playing' || app.ui.paused || runningSince !== null || holds > 0) return;
  if (document.visibilityState !== 'visible') return;
  runningSince = performance.now();
  if (!tick)
    tick = setInterval(() => {
      emit();
      if (performance.now() - lastAutosave > 10_000) saveCurrent();
    }, 1000);
}

function stopClock() {
  const g = app.current;
  if (g && runningSince !== null) {
    g.elapsedMs += performance.now() - runningSince;
  }
  runningSince = null;
  if (tick) {
    clearInterval(tick);
    tick = null;
  }
}

export function pauseGame(auto = false) {
  if (!app.current || app.current.status !== 'playing') return;
  if (app.ui.paused) return;
  stopClock();
  app.ui = { ...app.ui, paused: true, autoPaused: auto };
  saveCurrent();
  emit();
}

let holds = 0;
/** 有弹层盖在对局上时暂停计时（不遮盖盘面） */
export function holdClock() {
  holds++;
  stopClock();
}
export function releaseClock() {
  holds = Math.max(0, holds - 1);
  if (!holds) startClock();
}

export function resumeGame() {
  if (!app.current) return;
  app.ui = { ...app.ui, paused: false, autoPaused: false };
  startClock();
  emit();
}

let lifecycleInstalled = false;
export function installGameLifecycle() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  // 切到后台、锁屏、来电、分屏失焦：自动暂停
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (app.screen === 'game') pauseGame(true);
      flushWrites();
    }
  });
  window.addEventListener('blur', () => {
    if (app.screen === 'game') pauseGame(true);
  });
  window.addEventListener('pagehide', () => {
    if (app.screen === 'game') pauseGame(true);
  });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applySettingsSideEffects());
}

// ---------- 存档 ----------
export function saveCurrent() {
  const g = app.current;
  if (!g) return;
  lastAutosave = performance.now();
  const snap: GameState = structuredCloneSafe({ ...g, elapsedMs: Math.round(elapsedNow()), updatedAt: Date.now() });
  g.updatedAt = snap.updatedAt;
  persist((db) => db.saveGame(snap));
}

function structuredCloneSafe<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

// ---------- 开局 ----------
function newId(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return Date.now().toString(36) + '-' + a[0].toString(36) + a[1].toString(36);
}

const TIME_LIMITS: Record<Mode, Record<Level, number>> = {
  classic: { 1: 30_000, 2: 30_000, 3: 30_000, 4: 60_000, 5: 120_000 },
  diagonal: { 1: 30_000, 2: 30_000, 3: 30_000, 4: 60_000, 5: 120_000 },
  jigsaw: { 1: 40_000, 2: 40_000, 3: 40_000, 4: 90_000, 5: 180_000 },
  killer: { 1: 60_000, 2: 60_000, 3: 60_000, 4: 120_000, 5: 240_000 },
  samurai: { 1: 60_000, 2: 60_000, 3: 60_000, 4: 180_000, 5: 300_000 },
};

export async function startNewGame(mode: Mode, level: Level) {
  if (app.gen) return;
  const fromPool = await takeFromPool(mode, level);
  if (fromPool) {
    await beginGame(fromPool, false);
    return;
  }
  const handle = requestPuzzle(
    { mode, level, exclude: app.fingerprints, timeLimitMs: TIME_LIMITS[mode][level] },
    (p) => {
      if (!app.gen) return;
      app.gen = { ...app.gen, attempts: p.attempts, phase: p.phase };
      emit();
    },
  );
  app.gen = { mode, level, startedAt: Date.now(), attempts: 0, phase: 'solution', cancel: handle.cancel };
  openLayer({ type: 'generating' });
  let puzzle: PuzzleData | null = null;
  try {
    puzzle = await handle.promise;
  } catch (e) {
    app.gen = { ...app.gen!, error: '出题失败：' + String((e as Error).message ?? e) };
    emit();
    return;
  }
  const cancelled = !app.gen;
  if (cancelled) return;
  if (!puzzle) {
    app.gen = {
      ...app.gen!,
      error: `在时限内没能生成“${MODE_NAMES[mode]}·${LEVEL_NAMES[level]}”的合格题目（绝不会用低档题冒充）。可以重试，或稍后再来——空闲时会在后台预生成题池。`,
    };
    emit();
    return;
  }
  app.gen = null;
  await beginGame(puzzle, false);
}

export function cancelGeneration() {
  const g = app.gen;
  if (!g) return;
  g.cancel();
  app.gen = null;
  closeLayer();
  emit();
}

export async function beginGame(puzzle: PuzzleData, imported: boolean) {
  const g = newGame(puzzle, newId(), Date.now());
  g.imported = imported;
  app.fingerprints.add(puzzle.fingerprint);
  persist((db) => db.addFingerprints([puzzle.fingerprint]));
  app.games = [g, ...app.games];
  openGame(g);
  saveCurrent();
  // 首次进入某个模式时自动弹出规则卡
  if (!app.flags['rules:' + puzzle.mode]) {
    whenNavSettled(() =>
      setTimeout(() => {
        openLayer({ type: 'rules', mode: puzzle.mode, auto: true });
        setFlag('rules:' + puzzle.mode);
      }, 250),
    );
  }
}

export function openGame(g: GameState) {
  stopClock();
  app.current = g;
  app.ui = {
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
  };
  enterGameScreen();
  startClock();
  emit();
}

export function continueGame(id: string) {
  const g = app.games.find((x) => x.id === id);
  if (!g) return;
  openGame(g);
}

export function continueLast() {
  const g = app.games[0];
  if (g) openGame(g);
}

/** 离开对局界面（返回首页）：保存并停表 */
export function onLeaveGame() {
  stopClock();
  saveCurrent();
  const g = app.current;
  if (g && g.status === 'playing') {
    app.games = [g, ...app.games.filter((x) => x.id !== g.id)];
  }
  app.current = null;
}

export function backToHome() {
  leaveGameScreen();
}

// ---------- 对局操作 ----------
function afterAction(a: Action | null, kind: 'fill' | 'note' | 'erase' | 'undo' | 'redo' | 'hint' | 'auto' | 'restart', digit = 0) {
  const g = app.current;
  if (!g || !a) return;
  const s = app.settings;
  let wrongPlaced = false;
  if (kind === 'fill' || kind === 'redo' || kind === 'hint') {
    for (const ch of a.ch) {
      if (ch.nv && ch.nv !== ch.pv && ch.nv !== g.puzzle.solution[ch.c]) wrongPlaced = true;
    }
  }
  if (wrongPlaced && kind === 'fill') {
    g.errors++;
  }
  // 音效与动画
  if (kind === 'fill') {
    const placed = a.ch[0];
    if (placed.nv) {
      app.ui = { ...app.ui, pop: { cell: placed.c, key: (app.ui.pop?.key ?? 0) + 1 } };
      const showError =
        (s.errorMode === 'answer' && wrongPlaced) || (s.errorMode === 'conflict' && hasConflictAt(g, placed.c));
      if (showError) {
        sound.play('error');
        haptic(20);
      } else {
        sound.play('fill', digit);
        haptic(12);
        const groups = placed.nv === g.puzzle.solution[placed.c] ? completedGroups(g, placed.c) : [];
        if (groups.length) {
          const cells = [...new Set(groups.flatMap((x) => x.cells))];
          app.ui = { ...app.ui, ripple: { cells, origin: placed.c, key: (app.ui.ripple?.key ?? 0) + 1 } };
          setTimeout(() => sound.play('unit'), 90);
        }
        const cnt = digitCounts(g)[placed.nv];
        const geo = geometryOf(g.puzzle);
        if (cnt === digitTotal(g.puzzle.mode, geo.size) && !isFilled(g)) setTimeout(() => sound.play('digitDone'), 180);
      }
    } else sound.play('erase');
  } else if (kind === 'note') sound.play('note', digit);
  else if (kind === 'erase') sound.play('erase');
  else if (kind === 'undo') sound.play('undo');
  else if (kind === 'redo') sound.play('redo');
  else if (kind === 'auto' || kind === 'restart') sound.play('note', 5);

  // 错 3 次即失败（仅“对照答案”模式）
  if (s.errorMode === 'answer' && s.threeStrikes && g.errors >= 3) {
    finishCurrent('lost');
    return;
  }
  if (isFilled(g) && isSolvedByRules(g)) {
    finishCurrent('won');
    return;
  }
  saveCurrent();
  emit();
}

function hasConflictAt(g: GameState, c: number): boolean {
  const geo = geometryOf(g.puzzle);
  const v = g.values[c];
  if (!v) return false;
  for (const uid of geo.cellUnits[c]) for (const o of geo.units[uid].cells) if (o !== c && g.values[o] === v) return true;
  const cg = g.puzzle.cages?.find((k) => k.cells.includes(c));
  if (cg) {
    if (cg.cells.some((o) => o !== c && g.values[o] === v)) return true;
    let sum = 0;
    let full = true;
    for (const o of cg.cells) {
      if (!g.values[o]) full = false;
      sum += g.values[o];
    }
    if (sum > cg.sum || (full && sum !== cg.sum)) return true;
  }
  return false;
}

function clearHint() {
  if (app.ui.hint) app.ui = { ...app.ui, hint: null, hintStage: 0 };
}

export function selectCell(c: number) {
  const g = app.current;
  if (!g || app.ui.paused) return;
  const ui = app.ui;
  if (ui.lockMode && ui.lockDigit) {
    app.ui = { ...ui, selected: c };
    if (!isGiven(g, c)) {
      if (ui.noteMode) {
        clearHint();
        afterAction(toggleNote(g, c, ui.lockDigit), 'note', ui.lockDigit);
      } else {
        clearHint();
        afterAction(setValue(g, c, ui.lockDigit, { autoClearNotes: app.settings.autoClearNotes }), 'fill', ui.lockDigit);
      }
    }
    emit();
    return;
  }
  app.ui = { ...ui, selected: c };
  emit();
}

export function pressDigit(d: number) {
  const g = app.current;
  if (!g || app.ui.paused || g.status !== 'playing') return;
  const ui = app.ui;
  if (ui.lockMode) {
    app.ui = { ...ui, lockDigit: ui.lockDigit === d ? null : d };
    emit();
    return;
  }
  const c = ui.selected;
  if (c == null) {
    toast('先点一个格子');
    return;
  }
  if (isGiven(g, c)) return;
  clearHint();
  if (ui.noteMode) afterAction(toggleNote(g, c, d), 'note', d);
  else afterAction(setValue(g, c, d, { autoClearNotes: app.settings.autoClearNotes }), 'fill', d);
}

/** 长按数字键：对所选格切换该数字的笔记，不改变当前模式 */
export function longPressDigit(d: number) {
  const g = app.current;
  if (!g || app.ui.paused) return;
  const c = app.ui.selected;
  if (c == null || isGiven(g, c) || g.values[c]) {
    if (c != null && g.values[c] && !isGiven(g, c)) toast('该格已填数，先擦除才能记笔记');
    return;
  }
  clearHint();
  afterAction(toggleNote(g, c, d), 'note', d);
  haptic(15);
}

export function eraseSelected() {
  const g = app.current;
  if (!g || app.ui.paused) return;
  const c = app.ui.selected;
  if (c == null) return;
  clearHint();
  afterAction(eraseCell(g, c), 'erase');
}

export function toggleNoteMode() {
  app.ui = { ...app.ui, noteMode: !app.ui.noteMode };
  haptic(8);
  emit();
}

export function toggleLockMode() {
  const on = !app.ui.lockMode;
  app.ui = { ...app.ui, lockMode: on, lockDigit: on ? app.ui.lockDigit : null };
  toast(on ? '数字锁定：先选数字，再连续点格子' : '已退出数字锁定');
  emit();
}

export function doUndo() {
  const g = app.current;
  if (!g || app.ui.paused) return;
  clearHint();
  const a = undo(g);
  if (!a) {
    toast('没有可撤销的操作');
    return;
  }
  app.ui = { ...app.ui, selected: a.ch[0]?.c ?? app.ui.selected };
  afterAction(a, 'undo');
}

export function doRedo() {
  const g = app.current;
  if (!g || app.ui.paused) return;
  clearHint();
  const a = redo(g);
  if (!a) {
    toast('没有可重做的操作');
    return;
  }
  app.ui = { ...app.ui, selected: a.ch[0]?.c ?? app.ui.selected };
  afterAction(a, 'redo');
}

export function doAutoNotes() {
  const g = app.current;
  if (!g) return;
  clearHint();
  const a = autoNotes(g);
  if (!a) toast('候选已是最新');
  afterAction(a, 'auto');
}

/** 提示按钮：逐段推进 ①区域 ②技巧名 ③完整讲解 */
export function hintPress() {
  const g = app.current;
  if (!g || app.ui.paused || g.status !== 'playing') return;
  const ui = app.ui;
  if (!ui.hint) {
    const h = computeHint(g);
    if (!h) return;
    g.hints++;
    app.ui = { ...ui, hint: h, hintStage: 1 };
    sound.play('hint');
    saveCurrent();
  } else if (ui.hintStage < 3) {
    app.ui = { ...ui, hintStage: (ui.hintStage + 1) as 2 | 3 };
  }
  emit();
}

export function dismissHint() {
  clearHint();
  emit();
}

export function applyHint() {
  const g = app.current;
  const h = app.ui.hint;
  if (!g || !h) return;
  const a = applyHintChanges(g, h.placements, h.eliminations, h.erase, { autoClearNotes: app.settings.autoClearNotes });
  clearHint();
  if (a) {
    const p = h.placements[0];
    if (p) app.ui = { ...app.ui, selected: p.cell, pop: { cell: p.cell, key: (app.ui.pop?.key ?? 0) + 1 } };
    sound.play(p ? 'fill' : 'erase', p?.digit ?? 0);
  }
  afterAction(a, 'hint');
  emit();
}

export function confirmRestart() {
  openLayer({
    type: 'confirm',
    title: '重开本题？',
    message: '将清空你填写的所有数字和笔记（给定数保留）。计时、提示次数、错误次数照常保留。此操作可以撤销。',
    ok: '重开',
    onOk: () => {
      const g = app.current;
      if (!g) return;
      clearHint();
      afterAction(restart(g), 'restart');
    },
  });
}

export function confirmAbandon(id?: string) {
  const target = id ? app.games.find((x) => x.id === id) : app.current;
  if (!target) return;
  openLayer({
    type: 'confirm',
    title: '放弃这一局？',
    message: `${MODE_NAMES[target.puzzle.mode]} · ${LEVEL_NAMES[target.puzzle.level]}。放弃后这局会从未完成列表中删除，并记入历史（计为未完成）。此操作不能撤销。`,
    ok: '确认放弃',
    danger: true,
    onOk: () => abandon(target),
  });
}

async function abandon(g: GameState) {
  const isCurrent = app.current?.id === g.id;
  if (isCurrent) stopClock();
  const entry = historyEntry(g, 'abandoned');
  app.games = app.games.filter((x) => x.id !== g.id);
  app.history = [entry, ...app.history];
  await persist((db) => db.finishGame(g.id, entry));
  if (isCurrent) {
    app.current = null;
    // 关闭确认框后返回首页
    setTimeout(() => leaveGameScreen(), 50);
  }
  toast('已放弃');
  emit();
}

function historyEntry(g: GameState, result: HistoryEntry['result']): HistoryEntry {
  return {
    id: g.id,
    date: Date.now(),
    mode: g.puzzle.mode,
    level: g.puzzle.level,
    timeMs: Math.round(g.id === app.current?.id ? elapsedNow() : g.elapsedMs),
    hints: g.hints,
    errors: g.errors,
    assists: g.assists,
    score: g.puzzle.score,
    result,
    fingerprint: g.puzzle.fingerprint,
  };
}

function finishCurrent(result: 'won' | 'lost') {
  const g = app.current;
  if (!g) return;
  stopClock();
  const entry = historyEntry(g, result);
  g.elapsedMs = entry.timeMs;
  g.status = result;
  const prevWins = app.history.filter((h) => h.mode === g.puzzle.mode && h.level === g.puzzle.level && h.result === 'won');
  const prevBest = prevWins.length ? Math.min(...prevWins.map((h) => h.timeMs)) : null;
  const newRecord = result === 'won' && (prevBest === null || entry.timeMs < prevBest);
  app.history = [entry, ...app.history];
  app.games = app.games.filter((x) => x.id !== g.id);
  persist((db) => db.finishGame(g.id, entry));
  app.ui = { ...app.ui, selected: null, hint: null, hintStage: 0, lastResult: { entry, newRecord, prevBest } };
  if (result === 'won') {
    app.ui = { ...app.ui, winWave: Date.now() };
    sound.play('win');
    haptic(30);
    setTimeout(() => openLayer({ type: 'result' }), 900);
  } else {
    sound.play('error');
    openLayer({ type: 'result' });
  }
  emit();
}

export function setSamuraiGrid(gi: number) {
  const g = app.current;
  if (!g) return;
  g.grid = gi;
  app.ui = { ...app.ui, selected: null };
  saveCurrent();
  emit();
}

export function resultDone() {
  closeLayer();
  setTimeout(() => leaveGameScreen(), 60);
}

export { closeLayer, openLayer, replaceLayer };

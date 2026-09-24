// 对局逻辑（纯函数，不依赖 DOM）：填数、笔记、擦除、自动候选、提示应用、撤销/重做、完成判定。
// 所有修改都以 Action（一组格子变化）记录，撤销/重做只是反向/正向重放这些变化。
import { ALL } from '../engine/bits';
import { getGeometry, type Geometry } from '../engine/geometry';
import { buildModel } from '../engine/solver';
import type { Level, Mode, PuzzleData } from '../engine/types';
import { findConflicts, validateSolution } from '../engine/validate';

export const GAME_SCHEMA = 1;

export interface CellChange {
  c: number;
  /** 旧值 / 新值 */
  pv: number;
  nv: number;
  /** 旧笔记 / 新笔记（位掩码） */
  pn: number;
  nn: number;
}

export type ActionKind = 'set' | 'erase' | 'note' | 'autonotes' | 'hint' | 'restart';

export interface Action {
  t: ActionKind;
  ch: CellChange[];
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  v: number;
  id: string;
  puzzle: PuzzleData;
  values: number[];
  notes: number[];
  undo: Action[];
  redo: Action[];
  elapsedMs: number;
  hints: number;
  errors: number;
  /** 用过的辅助（自动填候选、组合助手）次数 */
  assists: number;
  status: GameStatus;
  createdAt: number;
  updatedAt: number;
  /** 武士：当前放大的子盘 */
  grid?: number;
  /** 是否为导入的题 */
  imported?: boolean;
  /** 本局是否用过杀手组合助手（首次使用计 1 次辅助） */
  comboUsed?: boolean;
}

export function geometryOf(p: PuzzleData): Geometry {
  return getGeometry(p.mode, p.regions);
}

export function newGame(puzzle: PuzzleData, id: string, now: number): GameState {
  return {
    v: GAME_SCHEMA,
    id,
    puzzle,
    values: puzzle.givens.slice(),
    notes: new Array(puzzle.givens.length).fill(0),
    undo: [],
    redo: [],
    elapsedMs: 0,
    hints: 0,
    errors: 0,
    assists: 0,
    status: 'playing',
    createdAt: now,
    updatedAt: now,
    grid: puzzle.mode === 'samurai' ? 2 : undefined,
  };
}

export const isGiven = (s: GameState, c: number) => s.puzzle.givens[c] !== 0;

function peersOf(s: GameState, c: number): Int32Array {
  return buildModel(geometryOf(s.puzzle), s.puzzle.cages).peers[c];
}

function commit(s: GameState, a: Action): Action | null {
  if (!a.ch.length) return null;
  for (const ch of a.ch) {
    s.values[ch.c] = ch.nv;
    s.notes[ch.c] = ch.nn;
  }
  s.undo.push(a);
  s.redo = [];
  return a;
}

export interface SetOptions {
  autoClearNotes: boolean;
}

/** 填数（与当前值相同则清除）。返回动作；错误计数由调用方根据查错模式处理。 */
export function setValue(s: GameState, c: number, d: number, opt: SetOptions): Action | null {
  if (s.status !== 'playing' || isGiven(s, c)) return null;
  const cur = s.values[c];
  if (cur === d) return eraseCell(s, c);
  const ch: CellChange[] = [{ c, pv: cur, nv: d, pn: s.notes[c], nn: 0 }];
  if (opt.autoClearNotes) {
    const b = 1 << (d - 1);
    for (const p of peersOf(s, c)) {
      if (!s.values[p] && s.notes[p] & b) ch.push({ c: p, pv: 0, nv: 0, pn: s.notes[p], nn: s.notes[p] & ~b });
    }
  }
  return commit(s, { t: 'set', ch });
}

export function toggleNote(s: GameState, c: number, d: number): Action | null {
  if (s.status !== 'playing' || isGiven(s, c) || s.values[c]) return null;
  const b = 1 << (d - 1);
  return commit(s, { t: 'note', ch: [{ c, pv: 0, nv: 0, pn: s.notes[c], nn: s.notes[c] ^ b }] });
}

export function eraseCell(s: GameState, c: number): Action | null {
  if (s.status !== 'playing' || isGiven(s, c)) return null;
  if (!s.values[c] && !s.notes[c]) return null;
  return commit(s, { t: 'erase', ch: [{ c, pv: s.values[c], nv: 0, pn: s.notes[c], nn: 0 }] });
}

/** 自动填候选：每个空格填上与已填数不冲突的全部数字（计为使用了辅助） */
export function autoNotes(s: GameState): Action | null {
  if (s.status !== 'playing') return null;
  const g = geometryOf(s.puzzle);
  const model = buildModel(g, s.puzzle.cages);
  const ch: CellChange[] = [];
  for (let c = 0; c < g.size; c++) {
    if (s.values[c]) continue;
    let m = ALL;
    for (const p of model.peers[c]) if (s.values[p]) m &= ~(1 << (s.values[p] - 1));
    if (m !== s.notes[c]) ch.push({ c, pv: 0, nv: 0, pn: s.notes[c], nn: m });
  }
  const a = commit(s, { t: 'autonotes', ch });
  if (a) s.assists++;
  return a;
}

/** 应用提示：放置数字 / 删去笔记候选 / 擦掉错误数字 */
export function applyHintChanges(
  s: GameState,
  placements: { cell: number; digit: number }[],
  eliminations: { cell: number; digit: number }[],
  erase: number[],
  opt: SetOptions,
): Action | null {
  if (s.status !== 'playing') return null;
  const values = s.values.slice();
  const notes = s.notes.slice();
  for (const c of erase) {
    values[c] = 0;
  }
  for (const e of eliminations) notes[e.cell] &= ~(1 << (e.digit - 1));
  for (const p of placements) {
    values[p.cell] = p.digit;
    notes[p.cell] = 0;
    if (opt.autoClearNotes) {
      const b = 1 << (p.digit - 1);
      for (const q of peersOf(s, p.cell)) if (!values[q]) notes[q] &= ~b;
    }
  }
  const ch: CellChange[] = [];
  for (let c = 0; c < values.length; c++) {
    if (values[c] !== s.values[c] || notes[c] !== s.notes[c]) ch.push({ c, pv: s.values[c], nv: values[c], pn: s.notes[c], nn: notes[c] });
  }
  return commit(s, { t: 'hint', ch });
}

/** 重开本题：清空所有玩家填写（可撤销） */
export function restart(s: GameState): Action | null {
  if (s.status !== 'playing') return null;
  const ch: CellChange[] = [];
  for (let c = 0; c < s.values.length; c++) {
    if (isGiven(s, c)) continue;
    if (s.values[c] || s.notes[c]) ch.push({ c, pv: s.values[c], nv: 0, pn: s.notes[c], nn: 0 });
  }
  return commit(s, { t: 'restart', ch });
}

export function undo(s: GameState): Action | null {
  if (s.status !== 'playing') return null;
  const a = s.undo.pop();
  if (!a) return null;
  for (const ch of a.ch) {
    s.values[ch.c] = ch.pv;
    s.notes[ch.c] = ch.pn;
  }
  s.redo.push(a);
  return a;
}

export function redo(s: GameState): Action | null {
  if (s.status !== 'playing') return null;
  const a = s.redo.pop();
  if (!a) return null;
  for (const ch of a.ch) {
    s.values[ch.c] = ch.nv;
    s.notes[ch.c] = ch.nn;
  }
  s.undo.push(a);
  return a;
}

export function isFilled(s: GameState): boolean {
  return s.values.every((v) => v !== 0);
}

/** 按全部规则校验（不是只比对答案） */
export function isSolvedByRules(s: GameState): boolean {
  if (!isFilled(s)) return false;
  return validateSolution(geometryOf(s.puzzle), s.values, s.puzzle.cages).length === 0;
}

export function conflictCells(s: GameState): Set<number> {
  return findConflicts(geometryOf(s.puzzle), s.values, s.puzzle.cages);
}

export function wrongCells(s: GameState): Set<number> {
  const out = new Set<number>();
  s.values.forEach((v, c) => {
    if (v && v !== s.puzzle.solution[c]) out.add(c);
  });
  return out;
}

/** 进度：玩家已正确或错误填入的格 / 需要填的格 */
export function progressPct(s: GameState): number {
  let need = 0;
  let filled = 0;
  s.values.forEach((v, c) => {
    if (s.puzzle.givens[c]) return;
    need++;
    if (v) filled++;
  });
  return need ? Math.round((filled / need) * 100) : 100;
}

/** 数字 d 在盘面上已填的个数（用于数字键盘剩余个数） */
export function digitCounts(s: GameState): number[] {
  const cnt = new Array(10).fill(0);
  for (const v of s.values) if (v) cnt[v]++;
  return cnt;
}

/** 数字 d 的总需求个数：武士 = 每个数字出现在每个子盘各 9 次再扣掉共享 */
export function digitTotal(mode: Mode, size: number): number {
  return mode === 'samurai' ? size / 9 : 9;
}

/** 某次填数后新完成的单元（行/列/宫/对角/区域/笼），用于波纹动画与琶音 */
export function completedGroups(s: GameState, c: number): { cells: number[] }[] {
  const g = geometryOf(s.puzzle);
  const out: { cells: number[] }[] = [];
  const full = (cells: number[]) => cells.every((x) => s.values[x] === s.puzzle.solution[x]);
  for (const uid of g.cellUnits[c]) {
    const u = g.units[uid];
    if (full(u.cells)) out.push({ cells: u.cells });
  }
  if (s.puzzle.cages) {
    const cg = s.puzzle.cages.find((k) => k.cells.includes(c));
    if (cg && full(cg.cells)) out.push({ cells: cg.cells });
  }
  return out;
}

export function levelOf(s: GameState): Level {
  return s.puzzle.level;
}

// 人类技巧求解器主循环 + 五档评级 + 提示。
// 规则：每一步总是先用最简单的可用技巧；难度档 = 用到的最难技巧所在档；同档内按技巧权重累加得分。
import type { Geometry } from '../geometry';
import type { Cage, Level } from '../types';
import {
  findClaiming,
  findFullHouse,
  findHiddenSingle,
  findHiddenSubset,
  findNakedSingle,
  findNakedSubset,
  findPointing,
} from './basic';
import { findAIC, findXChain, findXYChain } from './chains';
import { findFish } from './fish';
import {
  findCageCombo,
  findCageCross,
  findCageLocked,
  findCageUnique,
  findRule45,
  findRule45Multi,
  findRule45Union,
} from './killer';
import { findEmptyRectangle, findKite, findSimpleColoring, findSkyscraper } from './single-digit';
import { SolverState, TECHS, TECH_BY_ID, type Finder, type Step, type TechId } from './state';
import { findBUG, findUR } from './uniqueness';
import { findWWing, findXYWing, findXYZWing } from './wings';

export const FINDERS: Record<TechId, Finder> = {
  full_house: findFullHouse,
  hidden_single: findHiddenSingle,
  naked_single: findNakedSingle,
  cage_unique: findCageUnique,
  pointing: findPointing,
  claiming: findClaiming,
  cage_combo: findCageCombo,
  naked_pair: (s) => findNakedSubset(s, 2),
  hidden_pair: (s) => findHiddenSubset(s, 2),
  naked_triple: (s) => findNakedSubset(s, 3),
  hidden_triple: (s) => findHiddenSubset(s, 3),
  cage_cross: findCageCross,
  cage_locked: findCageLocked,
  rule45: findRule45,
  naked_quad: (s) => findNakedSubset(s, 4),
  hidden_quad: (s) => findHiddenSubset(s, 4),
  x_wing: (s) => findFish(s, 2),
  swordfish: (s) => findFish(s, 3),
  jellyfish: (s) => findFish(s, 4),
  xy_wing: findXYWing,
  xyz_wing: findXYZWing,
  w_wing: findWWing,
  skyscraper: findSkyscraper,
  two_string_kite: findKite,
  empty_rectangle: findEmptyRectangle,
  simple_coloring: findSimpleColoring,
  rule45_multi: findRule45Multi,
  rule45_union: findRule45Union,
  x_chain: findXChain,
  xy_chain: findXYChain,
  aic: findAIC,
  ur1: (s) => findUR(s, 1),
  ur2: (s) => findUR(s, 2),
  ur3: (s) => findUR(s, 3),
  ur4: (s) => findUR(s, 4),
  bug1: findBUG,
};

/** 找下一步：按目录顺序（先易后难），maxLevel 以上的技巧不尝试 */
export function nextStep(s: SolverState, maxLevel: Level = 5): Step | null {
  const killer = !!s.cages;
  for (const t of TECHS) {
    if (t.level > maxLevel) break;
    if (t.killerOnly && !killer) continue;
    const step = FINDERS[t.id](s);
    if (step) return step;
  }
  return null;
}

export interface RatingResult {
  solved: boolean;
  /** 用到的最难档位（未解出时为 null） */
  level: Level | null;
  /** 解不出时卡住的最高尝试档（超出 5 档或超过 maxLevel） */
  stuck: boolean;
  score: number;
  steps: number;
  techCounts: Partial<Record<TechId, number>>;
  /** 解题过程中出现矛盾（说明技巧实现有误，测试会检查它永远不出现） */
  broken: boolean;
}

export interface RateOptions {
  maxLevel?: Level;
  /** 记录完整步骤（提示/讲解用） */
  record?: Step[];
  /** 步数上限，防止任何意外死循环 */
  maxSteps?: number;
  /** 已知答案：每步检查推理与答案一致（测试用） */
  solution?: ArrayLike<number>;
}

export function rate(g: Geometry, givens: ArrayLike<number>, cages?: Cage[], opts: RateOptions = {}): RatingResult {
  const s = SolverState.fromValues(g, givens, cages);
  return rateState(s, opts);
}

export function rateState(s: SolverState, opts: RateOptions = {}): RatingResult {
  const it = rateIter(s, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** 可分片执行的评级（每一步 yield 一次，供主线程降级模式让出时间片） */
export function* rateIter(s: SolverState, opts: RateOptions = {}): Generator<void, RatingResult, void> {
  const maxLevel = opts.maxLevel ?? 5;
  const maxSteps = opts.maxSteps ?? 5000;
  let level = 0;
  let score = 0;
  let steps = 0;
  const techCounts: Partial<Record<TechId, number>> = {};
  let broken = false;
  while (!s.isSolved()) {
    if (steps >= maxSteps) break;
    const step = nextStep(s, maxLevel as Level);
    if (!step) break;
    if (opts.solution) {
      for (const p of step.placements) if (opts.solution[p.cell] !== p.digit) broken = true;
      for (const e of step.eliminations) if (opts.solution[e.cell] === e.digit) broken = true;
      if (broken) throw new Error(`技巧 ${step.tech} 推理与答案矛盾：${step.text}`);
    }
    opts.record?.push(step);
    s.apply(step);
    steps++;
    const info = TECH_BY_ID[step.tech];
    level = Math.max(level, info.level);
    score += info.weight;
    techCounts[step.tech] = (techCounts[step.tech] ?? 0) + 1;
    // 只检查本步涉及的格及其互斥格：有空格没有候选即矛盾（整盘单元检查放到结束时做一次）
    if (stepBroken(s, step)) {
      broken = true;
      break;
    }
    yield;
  }
  if (!broken && s.isSolved() === false && s.isBroken()) broken = true;
  const solved = s.isSolved() && !broken;
  return {
    solved,
    level: solved ? ((level || 1) as Level) : null,
    stuck: !solved,
    score: Math.round(score * 10) / 10,
    steps,
    techCounts,
    broken,
  };
}

function stepBroken(s: SolverState, step: Step): boolean {
  const check = (c: number) => !s.val[c] && s.cand[c] === 0;
  for (const e of step.eliminations) if (check(e.cell)) return true;
  for (const p of step.placements) {
    const peers = s.model.peers[p.cell];
    for (let k = 0; k < peers.length; k++) if (check(peers[k])) return true;
  }
  return false;
}

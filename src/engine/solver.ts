// 唯一性求解器 A：位掩码 + 约束传播（唯余、摒除、笼和上下界）+ MRV 回溯。
// 同时用于：数解（找到第 2 个解立即停止）、随机终盘生成（随机候选顺序）。
import { ALL, DIGITS, LOWEST_DIGIT, POP } from './bits';
import { allowedDigits } from './combos';
import type { Geometry } from './geometry';
import type { Cage } from './types';
import type { Rng } from './rng';

export interface Model {
  g: Geometry;
  cages?: Cage[];
  /** 每格的“互斥邻居”（单元邻居 + 同笼格） */
  peers: Int32Array[];
  cellCage: Int16Array;
}

const modelCache = new WeakMap<Geometry, Map<string, Model>>();

export function buildModel(g: Geometry, cages?: Cage[]): Model {
  const key = cages ? cages.map((c) => c.cells.join('.') + ':' + c.sum).join('|') : '';
  let m = modelCache.get(g);
  if (!m) {
    m = new Map();
    modelCache.set(g, m);
  }
  const hit = m.get(key);
  if (hit) return hit;
  const cellCage = new Int16Array(g.size).fill(-1);
  const peerSets = g.peers.map((p) => new Set(p));
  if (cages) {
    cages.forEach((cg, ci) => {
      for (const c of cg.cells) {
        cellCage[c] = ci;
        for (const o of cg.cells) if (o !== c) peerSets[c].add(o);
      }
    });
  }
  const model: Model = {
    g,
    cages,
    peers: peerSets.map((s) => Int32Array.from([...s].sort((a, b) => a - b))),
    cellCage,
  };
  if (m.size > 32) m.clear();
  m.set(key, model);
  return model;
}

export interface SolveResult {
  count: number;
  solution: number[] | null;
  /** 超出节点上限而中止 */
  aborted: boolean;
  nodes: number;
}

export interface SolveOptions {
  limit?: number;
  nodeLimit?: number;
  rng?: Rng;
}

class Search {
  count = 0;
  solution: number[] | null = null;
  nodes = 0;
  aborted = false;
  constructor(
    private model: Model,
    private limit: number,
    private nodeLimit: number,
    private rng?: Rng,
  ) {}

  run(givens: ArrayLike<number>) {
    const n = this.model.g.size;
    const cand = new Uint16Array(n).fill(ALL);
    const val = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const d = givens[i];
      if (d) {
        if (!(cand[i] & (1 << (d - 1)))) return;
        if (!this.assign(cand, val, i, d)) return;
      }
    }
    if (!this.propagate(cand, val)) return;
    this.dfs(cand, val);
  }

  private assign(cand: Uint16Array, val: Uint8Array, cell: number, d: number): boolean {
    const b = 1 << (d - 1);
    if (!(cand[cell] & b)) return false;
    val[cell] = d;
    cand[cell] = b;
    const peers = this.model.peers[cell];
    for (let k = 0; k < peers.length; k++) {
      const p = peers[k];
      if (cand[p] & b) {
        if (val[p]) return false;
        cand[p] &= ~b;
        if (cand[p] === 0) return false;
      }
    }
    return true;
  }

  private propagate(cand: Uint16Array, val: Uint8Array): boolean {
    const { g, cages } = this.model;
    const n = g.size;
    let changed = true;
    while (changed) {
      changed = false;
      // 唯余
      for (let i = 0; i < n; i++) {
        if (!val[i]) {
          const c = cand[i];
          if (c === 0) return false;
          if (POP[c] === 1) {
            if (!this.assign(cand, val, i, LOWEST_DIGIT[c])) return false;
            changed = true;
          }
        }
      }
      // 摒除（单元内某数字只剩一个位置）
      for (const u of g.units) {
        const cells = u.cells;
        let once = 0;
        let twice = 0;
        let placed = 0;
        for (let k = 0; k < 9; k++) {
          const c = cells[k];
          if (val[c]) {
            placed |= cand[c];
          } else {
            const m = cand[c];
            twice |= once & m;
            once |= m;
          }
        }
        if ((once | placed) !== ALL) return false;
        const single = once & ~twice & ~placed;
        if (single) {
          for (const d of DIGITS[single]) {
            const b = 1 << (d - 1);
            for (let k = 0; k < 9; k++) {
              const c = cells[k];
              if (!val[c] && cand[c] & b) {
                if (!this.assign(cand, val, c, d)) return false;
                break;
              }
            }
          }
          changed = true;
        }
      }
      // 杀手笼：和的上下界 + 组合剪枝
      if (cages) {
        for (const cg of cages) {
          let used = 0;
          let s = cg.sum;
          let k = 0;
          for (const c of cg.cells) {
            if (val[c]) {
              used |= cand[c];
              s -= val[c];
            } else k++;
          }
          if (k === 0) {
            if (s !== 0) return false;
            continue;
          }
          const allow = allowedDigits(k, s, used);
          if (!allow) return false;
          for (const c of cg.cells) {
            if (!val[c] && cand[c] & ~allow) {
              cand[c] &= allow;
              if (!cand[c]) return false;
              changed = true;
            }
          }
        }
      }
    }
    return true;
  }

  private dfs(cand: Uint16Array, val: Uint8Array): void {
    if (this.count >= this.limit || this.aborted) return;
    if (++this.nodes > this.nodeLimit) {
      this.aborted = true;
      return;
    }
    const n = this.model.g.size;
    let best = -1;
    let bestPop = 10;
    for (let i = 0; i < n; i++) {
      if (!val[i]) {
        const p = POP[cand[i]];
        if (p < bestPop) {
          bestPop = p;
          best = i;
          if (p === 2) break;
        }
      }
    }
    if (best === -1) {
      this.count++;
      if (!this.solution) this.solution = Array.from(val);
      return;
    }
    const digits = DIGITS[cand[best]].slice();
    if (this.rng) this.rng.shuffle(digits);
    for (const d of digits) {
      const c2 = cand.slice();
      const v2 = val.slice();
      if (this.assign(c2, v2, best, d) && this.propagate(c2, v2)) this.dfs(c2, v2);
      if (this.count >= this.limit || this.aborted) return;
    }
  }
}

/** 数解，找到 limit 个解立即停止（默认 2：足以判断唯一性）。 */
export function countSolutions(model: Model, givens: ArrayLike<number>, opts: SolveOptions = {}): SolveResult {
  const s = new Search(model, opts.limit ?? 2, opts.nodeLimit ?? Infinity, opts.rng);
  s.run(givens);
  return { count: s.count, solution: s.solution, aborted: s.aborted, nodes: s.nodes };
}

export function isUnique(model: Model, givens: ArrayLike<number>): boolean {
  const r = countSolutions(model, givens, { limit: 2 });
  return r.count === 1;
}

/** 随机终盘：随机候选顺序 + MRV 回溯。超过节点上限返回 null。 */
export function randomSolution(model: Model, rng: Rng, nodeLimit = 200_000): number[] | null {
  const empty = new Array(model.g.size).fill(0);
  const r = countSolutions(model, empty, { limit: 1, rng, nodeLimit });
  return r.solution;
}

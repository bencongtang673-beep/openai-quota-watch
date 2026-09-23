// 唯一性求解器 A：位掩码 + 约束传播（唯余、摒除、笼和上下界）+ MRV 回溯。
// 同时用于：数解（找到第 2 个解立即停止）、随机终盘生成（随机候选顺序）。
import { ALL, DIGITS, LOWEST_DIGIT, POP } from './bits';
import { combosFor } from './combos';
import type { Geometry } from './geometry';
import type { Cage } from './types';
import type { Rng } from './rng';

export interface Model {
  g: Geometry;
  /** 单元两两交集（≥2 格）：[交集格, A 独有格, B 独有格]，用于区块摒除传播 */
  inters: [Int32Array, Int32Array, Int32Array][];
  cages?: Cage[];
  /** 传播用的和约束：真实笼 + 45 法则内格虚拟笼 */
  propCages?: Cage[];
  /** 每格的“互斥邻居”（单元邻居 + 同笼格） */
  peers: Int32Array[];
  cellCage: Int16Array;
}

const modelCache = new WeakMap<Geometry, Map<string, Model>>();

const byCages = new WeakMap<Cage[], Model>();
const noCages = new WeakMap<Geometry, Model>();

export function buildModel(g: Geometry, cages?: Cage[]): Model {
  // 快速路径：同一个笼数组对象 / 无笼几何直接命中
  const fast = cages ? byCages.get(cages) : noCages.get(g);
  if (fast && fast.g === g) return fast;
  const built = buildModelSlow(g, cages);
  if (cages) byCages.set(cages, built);
  else noCages.set(g, built);
  return built;
}

function buildModelSlow(g: Geometry, cages?: Cage[]): Model {
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
  const inters: [Int32Array, Int32Array, Int32Array][] = [];
  for (let i = 0; i < g.units.length; i++)
    for (let j = i + 1; j < g.units.length; j++) {
      const A = g.units[i].cells;
      const B = new Set(g.units[j].cells);
      const both = A.filter((c) => B.has(c));
      if (both.length < 2) continue;
      const bs = new Set(both);
      inters.push([
        Int32Array.from(both),
        Int32Array.from(A.filter((c) => !bs.has(c))),
        Int32Array.from(g.units[j].cells.filter((c) => !bs.has(c))),
      ]);
    }
  // 45 法则派生的虚拟笼：某单元内“伸出去的笼”留在单元里的格（内格）之和已知，且这些格互不相同。
  // 只用于传播剪枝（与真实笼一样处理“和 + 互不相同”），不改变规则本身。
  let propCages = cages;
  if (cages) {
    const extra: Cage[] = [];
    const cageOf = new Int16Array(g.size).fill(-1);
    cages.forEach((cg, i) => cg.cells.forEach((c) => (cageOf[c] = i)));
    for (const u of g.units) {
      const set = new Set(u.cells);
      let full = 0;
      const innies: number[] = [];
      const seen = new Set<number>();
      for (const c of u.cells) {
        const ci = cageOf[c];
        if (seen.has(ci)) continue;
        seen.add(ci);
        const cg = cages[ci];
        const inside = cg.cells.filter((x) => set.has(x));
        if (inside.length === cg.cells.length) full += cg.sum;
        else innies.push(...inside);
      }
      if (innies.length >= 1 && innies.length <= 5) extra.push({ cells: innies, sum: 45 - full });
    }
    propCages = [...cages, ...extra];
  }
  const model: Model = {
    g,
    inters,
    cages,
    propCages,
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
  /** 找到的第二个解（count ≥ 2 时） */
  second: number[] | null;
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
  second: number[] | null = null;
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
    const { g, propCages: cages } = this.model;
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
      // 区块摒除：某数字在单元 A 中只出现在 A∩B，则从 B 的其余格删去（反之亦然）
      if (!changed) {
        for (const [both, aOnly, bOnly] of this.model.inters) {
          let inBoth = 0;
          for (let k = 0; k < both.length; k++) if (!val[both[k]]) inBoth |= cand[both[k]];
          if (!inBoth) continue;
          let inA = 0;
          for (let k = 0; k < aOnly.length; k++) if (!val[aOnly[k]]) inA |= cand[aOnly[k]];
          let inB = 0;
          for (let k = 0; k < bOnly.length; k++) if (!val[bOnly[k]]) inB |= cand[bOnly[k]];
          const lockedA = inBoth & ~inA; // 在 A 中只能在交集 → B 的其余格删去
          const lockedB = inBoth & ~inB;
          const rmB = lockedA & inB;
          const rmA = lockedB & inA;
          if (rmB) {
            for (let k = 0; k < bOnly.length; k++) {
              const c = bOnly[k];
              if (!val[c] && cand[c] & rmB) {
                cand[c] &= ~rmB;
                if (!cand[c]) return false;
              }
            }
            changed = true;
          }
          if (rmA) {
            for (let k = 0; k < aOnly.length; k++) {
              const c = aOnly[k];
              if (!val[c] && cand[c] & rmA) {
                cand[c] &= ~rmA;
                if (!cand[c]) return false;
              }
            }
            changed = true;
          }
        }
      }
      // 杀手笼：组合可行性剪枝（组合须能放进各格候选）+ 必含数字的笼内唯一位置 + 二格笼精确配对
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
          if (s <= 0) return false;
          let union = 0;
          let must = ALL;
          for (const m of combosFor(k, s)) {
            if (m & used) continue;
            let cover = 0;
            let ok = true;
            for (const c of cg.cells) {
              if (val[c]) continue;
              const x = cand[c] & m;
              if (!x) {
                ok = false;
                break;
              }
              cover |= x;
            }
            if (!ok || cover !== m) continue;
            union |= m;
            must &= m;
          }
          if (!union) return false;
          for (const c of cg.cells) {
            if (!val[c] && cand[c] & ~union) {
              cand[c] &= union;
              if (!cand[c]) return false;
              changed = true;
            }
          }
          // 必含数字只剩一个位置 → 直接填（填了就留到下一轮再处理本笼）
          let assigned = false;
          if (must !== ALL && must) {
            for (const d of DIGITS[must]) {
              const b = 1 << (d - 1);
              let pos = -1;
              let cnt = 0;
              for (const c of cg.cells) if (!val[c] && cand[c] & b) {
                cnt++;
                pos = c;
              }
              if (cnt === 0) return false;
              if (cnt === 1) {
                if (!this.assign(cand, val, pos, d)) return false;
                changed = true;
                assigned = true;
              }
            }
          }
          if (k === 2 && !assigned) {
            let a = -1;
            let b2 = -1;
            for (const c of cg.cells) if (!val[c]) {
              if (a < 0) a = c;
              else b2 = c;
            }
            for (const [x, y] of [
              [a, b2],
              [b2, a],
            ]) {
              let keep = 0;
              for (const d of DIGITS[cand[x]]) {
                const e = s - d;
                if (e >= 1 && e <= 9 && e !== d && cand[y] & (1 << (e - 1))) keep |= 1 << (d - 1);
              }
              if (keep !== cand[x]) {
                cand[x] = keep;
                if (!keep) return false;
                changed = true;
              }
            }
          }
        }
      }
    }
    return true;
  }

  /** 可分片的搜索：每 slice 个节点 yield 一次（主线程降级模式使用） */
  *runIter(givens: ArrayLike<number>, slice: number): Generator<void, void, void> {
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
    yield* this.dfsIter(cand, val, slice);
  }

  private *dfsIter(cand: Uint16Array, val: Uint8Array, slice: number): Generator<void, void, void> {
    if (this.count >= this.limit || this.aborted) return;
    if (++this.nodes > this.nodeLimit) {
      this.aborted = true;
      return;
    }
    if (this.nodes % slice === 0) yield;
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
      else if (!this.second) this.second = Array.from(val);
      return;
    }
    const digits = DIGITS[cand[best]].slice();
    if (this.rng) this.rng.shuffle(digits);
    for (const d of digits) {
      const c2 = cand.slice();
      const v2 = val.slice();
      if (this.assign(c2, v2, best, d) && this.propagate(c2, v2)) yield* this.dfsIter(c2, v2, slice);
      if (this.count >= this.limit || this.aborted) return;
    }
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
      else if (!this.second) this.second = Array.from(val);
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

/** 可分片版本的数解：每 slice 个搜索节点让出一次 */
export function* countSolutionsIter(
  model: Model,
  givens: ArrayLike<number>,
  opts: SolveOptions = {},
  slice = 8,
): Generator<void, SolveResult, void> {
  const s = new Search(model, opts.limit ?? 2, opts.nodeLimit ?? Infinity, opts.rng);
  yield* s.runIter(givens, slice);
  return { count: s.count, solution: s.solution, second: s.second, aborted: s.aborted, nodes: s.nodes };
}

/** 数解，找到 limit 个解立即停止（默认 2：足以判断唯一性）。 */
export function countSolutions(model: Model, givens: ArrayLike<number>, opts: SolveOptions = {}): SolveResult {
  const s = new Search(model, opts.limit ?? 2, opts.nodeLimit ?? Infinity, opts.rng);
  s.run(givens);
  return { count: s.count, solution: s.solution, second: s.second, aborted: s.aborted, nodes: s.nodes };
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

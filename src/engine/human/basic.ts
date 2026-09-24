// 1–3 档与四数组：最后一格、隐性唯一、显性唯一、区块摒除、数对 / 三数组 / 四数组。
import { DIGITS, LOWEST_DIGIT, POP } from '../bits';
import type { Geometry } from '../geometry';
import type { Unit } from '../types';
import { cn, cns, ds, elimText, un } from './fmt';
import type { CellDigit, SolverState, Step, TechId } from './state';

const UNIT_ORDER: Record<Unit['type'], number> = { box: 0, region: 0, row: 1, col: 2, diag: 3 };

function sortedUnits(g: Geometry): Unit[] {
  return g.units.slice().sort((a, b) => UNIT_ORDER[a.type] - UNIT_ORDER[b.type] || a.id - b.id);
}
const sortedCache = new WeakMap<Geometry, Unit[]>();
function unitsInOrder(g: Geometry): Unit[] {
  let u = sortedCache.get(g);
  if (!u) {
    u = sortedUnits(g);
    sortedCache.set(g, u);
  }
  return u;
}

export function findFullHouse(s: SolverState): Step | null {
  for (const u of unitsInOrder(s.g)) {
    let empty = -1;
    let count = 0;
    let used = 0;
    for (const c of u.cells) {
      if (s.val[c]) used |= 1 << (s.val[c] - 1);
      else {
        empty = c;
        count++;
      }
    }
    if (count === 1) {
      const d = LOWEST_DIGIT[0x1ff & ~used];
      if (!d || !s.has(empty, d)) continue;
      return {
        tech: 'full_house',
        placements: [{ cell: empty, digit: d }],
        eliminations: [],
        highlight: { area: u.cells, units: [u.id], keys: [{ cell: empty, digit: d }] },
        text: `${un(s.g, u)}只剩 ${cn(s.g, empty)} 一个空格，缺的数字是 ${d}，所以 ${cn(s.g, empty)} = ${d}。`,
      };
    }
  }
  return null;
}

export function findHiddenSingle(s: SolverState): Step | null {
  for (const u of unitsInOrder(s.g)) {
    // 位掩码统计：once = 至少出现一次的候选，twice = 至少出现两次，placed = 已填数字
    let once = 0;
    let twice = 0;
    let placed = 0;
    for (const c of u.cells) {
      if (s.val[c]) placed |= 1 << (s.val[c] - 1);
      else {
        const m = s.cand[c];
        twice |= once & m;
        once |= m;
      }
    }
    const single = once & ~twice & ~placed;
    if (!single) continue;
    const d = LOWEST_DIGIT[single];
    const b = 1 << (d - 1);
    const c = u.cells.find((x) => !s.val[x] && s.cand[x] & b)!;
    return {
      tech: 'hidden_single',
      placements: [{ cell: c, digit: d }],
      eliminations: [],
      highlight: { area: u.cells, units: [u.id], keys: [{ cell: c, digit: d }] },
      text: `在${un(s.g, u)}中，数字 ${d} 只能放在 ${cn(s.g, c)}（其他格都被同行、同列或同单元里的 ${d} 排除了），所以 ${cn(s.g, c)} = ${d}。`,
    };
  }
  return null;
}

export function findNakedSingle(s: SolverState): Step | null {
  for (let c = 0; c < s.n; c++) {
    if (!s.val[c] && POP[s.cand[c]] === 1) {
      const d = LOWEST_DIGIT[s.cand[c]];
      return {
        tech: 'naked_single',
        placements: [{ cell: c, digit: d }],
        eliminations: [],
        highlight: { area: [c, ...s.model.peers[c]], keys: [{ cell: c, digit: d }] },
        text: `${cn(s.g, c)} 所在的行、列、宫${s.cages ? '、笼' : ''}已经排除了其他数字，只剩下候选 ${d}，所以 ${cn(s.g, c)} = ${d}。`,
      };
    }
  }
  return null;
}

// ---------- 区块摒除 ----------
interface Inter {
  a: Unit;
  b: Unit;
  cells: number[];
}
const interCache = new WeakMap<Geometry, Inter[]>();
function intersections(g: Geometry): Inter[] {
  let r = interCache.get(g);
  if (r) return r;
  r = [];
  for (const a of g.units)
    for (const b of g.units) {
      if (a === b) continue;
      const set = new Set(b.cells);
      const cells = a.cells.filter((c) => set.has(c));
      if (cells.length >= 2) r.push({ a, b, cells });
    }
  // 先宫→行列（pointing），再行列→宫（claiming）
  const isBox = (u: Unit) => u.type === 'box' || u.type === 'region';
  r.sort((x, y) => Number(!isBox(x.a)) - Number(!isBox(y.a)));
  interCache.set(g, r);
  return r;
}

function findIntersection(s: SolverState, wantPointing: boolean): Step | null {
  const isBox = (u: Unit) => u.type === 'box' || u.type === 'region';
  for (const it of intersections(s.g)) {
    if (isBox(it.a) !== wantPointing) continue;
    // pointing 只看 宫→行/列/对角；claiming 看 行/列/对角→其它
    for (let d = 1; d <= 9; d++) {
      const pos = s.positions(it.a, d);
      if (pos.length < 2) continue;
      if (!pos.every((c) => it.cells.includes(c))) continue;
      const elims: CellDigit[] = [];
      for (const c of it.b.cells) if (!it.cells.includes(c) && !s.val[c] && s.has(c, d)) elims.push({ cell: c, digit: d });
      if (!elims.length) continue;
      const tech: TechId = wantPointing ? 'pointing' : 'claiming';
      return {
        tech,
        placements: [],
        eliminations: elims,
        highlight: {
          area: [...new Set([...it.a.cells, ...it.b.cells])],
          units: [it.a.id, it.b.id],
          keys: pos.map((c) => ({ cell: c, digit: d })),
        },
        text: `在${un(s.g, it.a)}中，数字 ${d} 只可能出现在 ${cns(s.g, pos)}，它们都位于${un(s.g, it.b)}。所以${un(
          s.g,
          it.b,
        )}的 ${d} 一定在这几格之中，${un(s.g, it.b)}的其他格不能是 ${d}：${elimText(s.g, elims)}。`,
      };
    }
  }
  return null;
}

export const findPointing = (s: SolverState) => findIntersection(s, true);
export const findClaiming = (s: SolverState) => findIntersection(s, false);

// ---------- 数组 ----------
function* combinations<T>(arr: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i]);
    yield* combinations(arr, k, i + 1, acc);
    acc.pop();
  }
}

const NAKED_NAMES: Record<number, TechId> = { 2: 'naked_pair', 3: 'naked_triple', 4: 'naked_quad' };
const HIDDEN_NAMES: Record<number, TechId> = { 2: 'hidden_pair', 3: 'hidden_triple', 4: 'hidden_quad' };
const K_NAMES: Record<number, string> = { 2: '数对', 3: '三数组', 4: '四数组' };

/** 显性数组：单元（及杀手笼）内 k 个格的候选并集恰好 k 个数字 */
export function findNakedSubset(s: SolverState, k: number): Step | null {
  const groups: { cells: number[]; label: string; unit?: number; cage?: number }[] = unitsInOrder(s.g).map((u) => ({
    cells: u.cells,
    label: un(s.g, u),
    unit: u.id,
  }));
  if (s.cages) s.cages.forEach((cg, i) => cg.cells.length > k && groups.push({ cells: cg.cells, label: '所在笼', cage: i }));
  for (const grp of groups) {
    const empties = grp.cells.filter((c) => !s.val[c] && POP[s.cand[c]] >= 2 && POP[s.cand[c]] <= k);
    const allEmpty = grp.cells.filter((c) => !s.val[c]);
    if (allEmpty.length <= k) continue;
    for (const combo of combinations(empties, k)) {
      let m = 0;
      for (const c of combo) m |= s.cand[c];
      if (POP[m] !== k) continue;
      const elims: CellDigit[] = [];
      for (const c of allEmpty) {
        if (combo.includes(c)) continue;
        for (const d of DIGITS[s.cand[c] & m]) elims.push({ cell: c, digit: d });
      }
      if (!elims.length) continue;
      const digits = DIGITS[m];
      return {
        tech: NAKED_NAMES[k],
        placements: [],
        eliminations: elims,
        highlight: {
          area: grp.cells,
          units: grp.unit !== undefined ? [grp.unit] : [],
          cages: grp.cage !== undefined ? [grp.cage] : [],
          keys: combo.flatMap((c) => DIGITS[s.cand[c]].map((d) => ({ cell: c, digit: d }))),
        },
        text: `${grp.label}中，${cns(s.g, combo)} 这 ${k} 格的候选合起来只有 ${ds(digits)} 这 ${k} 个数字，它们必定占据这 ${k} 格（显性${K_NAMES[k]}）。所以同一${grp.cage !== undefined ? '笼' : '单元'}的其他格不能再填这些数字：${elimText(s.g, elims)}。`,
      };
    }
  }
  return null;
}

/** 隐性数组：单元内 k 个数字只出现在同样的 k 格中 */
export function findHiddenSubset(s: SolverState, k: number): Step | null {
  for (const u of unitsInOrder(s.g)) {
    const digits: number[] = [];
    const posMask = new Map<number, number[]>();
    for (let d = 1; d <= 9; d++) {
      if (s.placedInUnit(u, d)) continue;
      const pos = s.positions(u, d);
      if (pos.length >= 2 && pos.length <= k) {
        digits.push(d);
        posMask.set(d, pos);
      }
    }
    const emptyCount = u.cells.filter((c) => !s.val[c]).length;
    if (emptyCount <= k) continue;
    for (const combo of combinations(digits, k)) {
      const cells = new Set<number>();
      for (const d of combo) for (const c of posMask.get(d)!) cells.add(c);
      if (cells.size !== k) continue;
      let m = 0;
      for (const d of combo) m |= 1 << (d - 1);
      const elims: CellDigit[] = [];
      for (const c of cells) for (const d of DIGITS[s.cand[c] & ~m]) elims.push({ cell: c, digit: d });
      if (!elims.length) continue;
      const cellArr = [...cells].sort((a, b) => a - b);
      return {
        tech: HIDDEN_NAMES[k],
        placements: [],
        eliminations: elims,
        highlight: {
          area: u.cells,
          units: [u.id],
          keys: cellArr.flatMap((c) => combo.filter((d) => s.has(c, d)).map((d) => ({ cell: c, digit: d }))),
        },
        text: `在${un(s.g, u)}中，数字 ${ds(combo)} 只出现在 ${cns(s.g, cellArr)} 这 ${k} 格（隐性${K_NAMES[k]}），所以这 ${k} 格只能填这 ${k} 个数字，其他候选都可以删去：${elimText(s.g, elims)}。`,
      };
    }
  }
  return null;
}

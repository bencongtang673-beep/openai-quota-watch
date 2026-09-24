// 杀手数独专属推理：
//  1 档：笼的唯一组合；2 档：组合与已填数的直接排除；
//  3 档：组合×候选交叉排除、笼内锁定数字、45 法则（单格内格/外格）；
//  4 档：45 法则（多格内格/外格）；5 档：多单元联立 45 法则（另有二格笼等价关系进入 AIC）。
import { ALL, DIGITS, POP } from '../bits';
import { combosFor } from '../combos';
import type { Unit } from '../types';
import { cn, cns, ds, elimText, un } from './fmt';
import type { CellDigit, SolverState, Step } from './state';

interface SumResult {
  /** 每格可取的数字 */
  masks: number[];
  /** 所有可行赋值中必然出现的数字（仅 all-distinct 时有意义） */
  must: number;
  /** 可行赋值用到的数字组合集合 */
  combos: Set<number>;
}

/** 枚举满足“和 + 互斥”的所有赋值，返回每格可能值。distinctAll=true 表示所有格两两不同（真实笼）。 */
export function sumOptions(s: SolverState, cells: number[], sum: number, distinctAll: boolean, limit = 200_000): SumResult | null {
  const k = cells.length;
  const order = cells.slice().sort((a, b) => POP[s.cand[a]] - POP[s.cand[b]]);
  const minOf = order.map((c) => DIGITS[s.cand[c]][0] ?? 10);
  const maxOf = order.map((c) => {
    const d = DIGITS[s.cand[c]];
    return d[d.length - 1] ?? 0;
  });
  const sufMin = new Array(k + 1).fill(0);
  const sufMax = new Array(k + 1).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    sufMin[i] = sufMin[i + 1] + minOf[i];
    sufMax[i] = sufMax[i + 1] + maxOf[i];
  }
  const masks = new Array(k).fill(0);
  let must = ALL;
  let any = false;
  const combos = new Set<number>();
  const vals = new Array(k).fill(0);
  let nodes = 0;
  let aborted = false;
  const rec = (i: number, rem: number, used: number) => {
    if (aborted) return;
    if (++nodes > limit) {
      aborted = true;
      return;
    }
    if (i === k) {
      if (rem !== 0) return;
      any = true;
      for (let j = 0; j < k; j++) masks[j] |= 1 << (vals[j] - 1);
      must &= used;
      combos.add(used);
      return;
    }
    if (rem < sufMin[i] || rem > sufMax[i]) return;
    const c = order[i];
    for (const d of DIGITS[s.cand[c]]) {
      if (d > rem) break;
      const b = 1 << (d - 1);
      if (distinctAll) {
        if (used & b) continue;
      } else {
        let clash = false;
        for (let j = 0; j < i; j++) if (vals[j] === d && s.sees(order[j], c)) {
          clash = true;
          break;
        }
        if (clash) continue;
      }
      vals[i] = d;
      rec(i + 1, rem - d, used | b);
    }
    vals[i] = 0;
  };
  rec(0, sum, 0);
  if (aborted) return null;
  if (!any) return { masks: cells.map(() => 0), must: 0, combos };
  const byCell = new Map<number, number>();
  order.forEach((c, j) => byCell.set(c, masks[j]));
  return { masks: cells.map((c) => byCell.get(c)!), must: distinctAll ? must : 0, combos };
}

function cageState(s: SolverState, ci: number) {
  const cg = s.cages![ci];
  const empties = cg.cells.filter((c) => !s.val[c]);
  let used = 0;
  let rem = cg.sum;
  for (const c of cg.cells) if (s.val[c]) {
    used |= 1 << (s.val[c] - 1);
    rem -= s.val[c];
  }
  return { cg, empties, used, rem };
}

const cageLabel = (s: SolverState, ci: number) => {
  const cg = s.cages![ci];
  return `${cg.cells.length} 格笼（和 ${cg.sum}，${cns(s.g, [cg.cells[0]])} 起）`;
};

/** 1 档：笼的唯一组合 */
export function findCageUnique(s: SolverState): Step | null {
  if (!s.cages) return null;
  for (let ci = 0; ci < s.cages.length; ci++) {
    const { cg, empties } = cageState(s, ci);
    if (!empties.length) continue;
    const combos = combosFor(cg.cells.length, cg.sum);
    if (combos.length !== 1) continue;
    const m = combos[0];
    const elims: CellDigit[] = [];
    for (const c of empties) for (const d of DIGITS[s.cand[c] & ~m]) elims.push({ cell: c, digit: d });
    if (!elims.length) continue;
    return {
      tech: 'cage_unique',
      placements: [],
      eliminations: elims,
      highlight: { area: cg.cells, cages: [ci], keys: empties.flatMap((c) => DIGITS[s.cand[c] & m].map((d) => ({ cell: c, digit: d }))) },
      text: `${cageLabel(s, ci)}：${cg.cells.length} 个不同数字相加等于 ${cg.sum} 只有一种组合 {${ds(DIGITS[m])}}，所以笼内各格只能从这些数字中取：${elimText(s.g, elims)}。`,
    };
  }
  return null;
}

/** 2 档：组合与已填数的直接排除 */
export function findCageCombo(s: SolverState): Step | null {
  if (!s.cages) return null;
  for (let ci = 0; ci < s.cages.length; ci++) {
    const { cg, empties, used, rem } = cageState(s, ci);
    if (!empties.length) continue;
    // 每个空格被“已填数”直接排除后的基础候选
    const basic = empties.map((c) => {
      let m = ALL & ~used;
      for (const p of s.model.peers[c]) if (s.val[p]) m &= ~(1 << (s.val[p] - 1));
      return m;
    });
    const anyBasic = basic.reduce((a, b) => a | b, 0);
    const all = combosFor(empties.length, rem).filter((m) => (m & used) === 0);
    const alive = all.filter((m) => (m & anyBasic) === m);
    if (!alive.length) continue;
    const union = alive.reduce((a, b) => a | b, 0);
    const elims: CellDigit[] = [];
    for (const c of empties) for (const d of DIGITS[s.cand[c] & ~union]) elims.push({ cell: c, digit: d });
    if (!elims.length) continue;
    const dead = all.filter((m) => !alive.includes(m));
    const placedText = used ? `笼内已填 ${ds(DIGITS[used])}，剩余 ${empties.length} 格之和为 ${rem}；` : '';
    const deadText = dead.length ? `组合 ${dead.map((m) => '{' + ds(DIGITS[m]) + '}').join('、')} 含有已被同行/列/宫的已填数排除的数字，不可能；` : '';
    return {
      tech: 'cage_combo',
      placements: [],
      eliminations: elims,
      highlight: { area: cg.cells, cages: [ci] },
      text: `${cageLabel(s, ci)}：${placedText}${deadText}剩下的组合 ${alive.map((m) => '{' + ds(DIGITS[m]) + '}').join('、')} 只用到数字 ${ds(
        DIGITS[union],
      )}，因此 ${elimText(s.g, elims)}。`,
    };
  }
  return null;
}

/** 3 档：组合 × 候选交叉排除 */
export function findCageCross(s: SolverState): Step | null {
  if (!s.cages) return null;
  for (let ci = 0; ci < s.cages.length; ci++) {
    const { cg, empties, rem, used } = cageState(s, ci);
    if (empties.length < 2) continue;
    const saved = empties.map((c) => s.cand[c]);
    empties.forEach((c) => (s.cand[c] &= ~used));
    const r = sumOptions(s, empties, rem, true);
    empties.forEach((c, i) => (s.cand[c] = saved[i]));
    if (!r) continue;
    const elims: CellDigit[] = [];
    empties.forEach((c, i) => {
      for (const d of DIGITS[s.cand[c] & ~r.masks[i]]) elims.push({ cell: c, digit: d });
    });
    if (!elims.length) continue;
    const combos = [...r.combos].map((m) => '{' + ds(DIGITS[m]) + '}');
    return {
      tech: 'cage_cross',
      placements: [],
      eliminations: elims,
      highlight: { area: cg.cells, cages: [ci] },
      text: `${cageLabel(s, ci)}：结合各格当前候选逐一检验，剩余 ${empties.length} 格（和 ${rem}）只有组合 ${combos.join('、')} 能真正放进去，每格可取的值因此缩小：${elimText(
        s.g,
        elims,
      )}。`,
    };
  }
  return null;
}

/** 3 档：笼内锁定数字——笼必含某数字，且笼内可放该数字的格都在同一单元 → 该单元其余格删去 */
export function findCageLocked(s: SolverState): Step | null {
  if (!s.cages) return null;
  for (let ci = 0; ci < s.cages.length; ci++) {
    const { cg, empties, rem, used } = cageState(s, ci);
    if (empties.length < 2) continue;
    const saved = empties.map((c) => s.cand[c]);
    empties.forEach((c) => (s.cand[c] &= ~used));
    const r = sumOptions(s, empties, rem, true);
    empties.forEach((c, i) => (s.cand[c] = saved[i]));
    if (!r || !r.must) continue;
    for (const x of DIGITS[r.must]) {
      const holders = empties.filter((_c, i) => r.masks[i] & (1 << (x - 1)));
      if (holders.length < 1) continue;
      for (const uid of s.g.cellUnits[holders[0]]) {
        const u: Unit = s.g.units[uid];
        if (!holders.every((c) => u.cells.includes(c))) continue;
        const elims = u.cells
          .filter((c) => !cg.cells.includes(c) && !s.val[c] && s.has(c, x))
          .map((c) => ({ cell: c, digit: x }));
        if (!elims.length) continue;
        return {
          tech: 'cage_locked',
          placements: [],
          eliminations: elims,
          highlight: {
            area: [...new Set([...cg.cells, ...u.cells])],
            cages: [ci],
            units: [u.id],
            keys: holders.map((c) => ({ cell: c, digit: x })),
          },
          text: `${cageLabel(s, ci)}：所有可行组合都包含 ${x}，所以 ${x} 一定在这个笼里，而且只能在 ${cns(s.g, holders)}，它们都属于${un(
            s.g,
            u,
          )}。因此${un(s.g, u)}中笼外的格不能是 ${x}：${elimText(s.g, elims)}。`,
        };
      }
    }
  }
  return null;
}

// ---------- 45 法则 ----------
interface Virtual {
  cells: number[]; // 未填格
  sum: number;
  kind: '内格' | '外格';
  houseLabel: string;
  houseCells: number[];
  cages: number[];
}

function virtualsFor(s: SolverState, houseCells: number[], houseLabel: string): Virtual[] {
  const set = new Set(houseCells);
  const total = 45 * (houseCells.length / 9);
  const cages = s.cages!;
  const touched = new Set<number>();
  for (const c of houseCells) touched.add(s.model.cellCage[c]);
  let fullSum = 0;
  let partialSum = 0;
  const innies: number[] = [];
  const outies: number[] = [];
  const involved: number[] = [];
  for (const ci of touched) {
    if (ci < 0) continue;
    involved.push(ci);
    const cg = cages[ci];
    const inside = cg.cells.filter((c) => set.has(c));
    if (inside.length === cg.cells.length) fullSum += cg.sum;
    else {
      partialSum += cg.sum;
      innies.push(...inside);
      outies.push(...cg.cells.filter((c) => !set.has(c)));
    }
  }
  const out: Virtual[] = [];
  const reduce = (cells: number[], sum: number, kind: Virtual['kind']) => {
    let rem = sum;
    const empties: number[] = [];
    for (const c of cells) {
      if (s.val[c]) rem -= s.val[c];
      else empties.push(c);
    }
    if (empties.length) out.push({ cells: empties, sum: rem, kind, houseLabel, houseCells, cages: involved });
  };
  if (innies.length) {
    const innieSum = total - fullSum;
    reduce(innies, innieSum, '内格');
    reduce(outies, partialSum - innieSum, '外格');
  }
  return out;
}

function houseSets(s: SolverState, level: 'single' | 'union'): { cells: number[]; label: string }[] {
  const out: { cells: number[]; label: string }[] = [];
  const rows = s.rows[0];
  const cols = s.cols[0];
  if (level === 'single') {
    for (const u of s.g.units) out.push({ cells: u.cells, label: un(s.g, u) });
    return out;
  }
  for (const [lines, word] of [
    [rows, '行'],
    [cols, '列'],
  ] as const) {
    for (let w = 2; w <= 3; w++)
      for (let i = 0; i + w <= 9; i++) {
        const us = lines.slice(i, i + w);
        out.push({ cells: us.flatMap((u) => u.cells), label: `第 ${i + 1}–${i + w} ${word}` });
      }
  }
  // 相邻两宫
  const boxes = s.boxes;
  for (let b = 0; b < 9; b++) {
    if (b % 3 < 2) out.push({ cells: [...boxes[b].cells, ...boxes[b + 1].cells], label: `第 ${b + 1}、${b + 2} 宫` });
    if (b < 6) out.push({ cells: [...boxes[b].cells, ...boxes[b + 3].cells], label: `第 ${b + 1}、${b + 4} 宫` });
  }
  return out;
}

function rule45(s: SolverState, mode: 'single1' | 'multi' | 'union'): Step | null {
  if (!s.cages) return null;
  const sets = houseSets(s, mode === 'union' ? 'union' : 'single');
  for (const hs of sets) {
    for (const v of virtualsFor(s, hs.cells, hs.label)) {
      const k = v.cells.length;
      if (mode === 'single1' && k !== 1) continue;
      if (mode === 'multi' && (k < 2 || k > 4)) continue;
      if (mode === 'union' && k > 5) continue;
      const tech = mode === 'single1' ? 'rule45' : mode === 'multi' ? 'rule45_multi' : 'rule45_union';
      const intro = `45 法则：${v.houseLabel}的数字总和是 ${45 * (v.houseCells.length / 9)}。完全落在其中的笼之和已知，${
        v.kind === '内格' ? '伸出去的笼留在里面的格（内格）' : '伸进来的笼在外面的格（外格）'
      }之和因此确定：${cns(s.g, v.cells)} 的和为 ${v.sum}`;
      if (k === 1) {
        const c = v.cells[0];
        const d = v.sum;
        if (d < 1 || d > 9 || !s.has(c, d)) continue;
        return {
          tech,
          placements: [{ cell: c, digit: d }],
          eliminations: [],
          highlight: { area: v.houseCells, cages: v.cages, keys: [{ cell: c, digit: d }] },
          text: `${intro}，所以 ${cn(s.g, c)} = ${d}。`,
        };
      }
      const distinct = v.cells.every((a) => v.cells.every((b) => a === b || s.sees(a, b)));
      const r = sumOptions(s, v.cells, v.sum, distinct);
      if (!r) continue;
      const elims: CellDigit[] = [];
      v.cells.forEach((c, i) => {
        for (const d of DIGITS[s.cand[c] & ~r.masks[i]]) elims.push({ cell: c, digit: d });
      });
      if (!elims.length) continue;
      return {
        tech,
        placements: [],
        eliminations: elims,
        highlight: { area: v.houseCells, cages: v.cages, keys: v.cells.flatMap((c, i) => DIGITS[r.masks[i]].map((d) => ({ cell: c, digit: d }))) },
        text: `${intro}。结合各格候选，能凑出 ${v.sum} 的取值有限：${elimText(s.g, elims)}。`,
      };
    }
  }
  return null;
}

export const findRule45 = (s: SolverState) => rule45(s, 'single1');
export const findRule45Multi = (s: SolverState) => rule45(s, 'multi');
export const findRule45Union = (s: SolverState) => rule45(s, 'union');

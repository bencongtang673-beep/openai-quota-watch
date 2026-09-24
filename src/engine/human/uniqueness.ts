// 基于唯一解的技巧：唯一矩形 1–4 型、BUG+1。杀手数独不使用（笼和会破坏“互换仍成立”的前提）。
import { DIGITS, POP } from '../bits';
import { cn, cns, elimText, un } from './fmt';
import type { CellDigit, SolverState, Step, TechId } from './state';

interface Rect {
  cells: [number, number, number, number]; // A B / C D ；对角：A-D、B-C
}

const rectCache = new WeakMap<object, Rect[]>();

/** 满足“致命模式”条件的矩形：每个涉及的单元恰好包含两个角，且不是对角 */
function rectangles(s: SolverState): Rect[] {
  const hit = rectCache.get(s.g);
  if (hit) return hit;
  const out: Rect[] = [];
  const seen = new Set<string>();
  s.g.grids.forEach((sg) => {
    for (let r1 = 0; r1 < 9; r1++)
      for (let r2 = r1 + 1; r2 < 9; r2++)
        for (let c1 = 0; c1 < 9; c1++)
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            const A = sg.cells[r1 * 9 + c1];
            const B = sg.cells[r1 * 9 + c2];
            const C = sg.cells[r2 * 9 + c1];
            const D = sg.cells[r2 * 9 + c2];
            const key = [A, B, C, D].sort((a, b) => a - b).join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            const corners = [A, B, C, D];
            let ok = true;
            const unitIds = new Set<number>();
            for (const c of corners) for (const u of s.g.cellUnits[c]) unitIds.add(u);
            for (const uid of unitIds) {
              const inU = corners.filter((c) => s.g.units[uid].cells.includes(c));
              if (inU.length !== 2) {
                ok = false;
                break;
              }
              const [x, y] = inU;
              if ((x === A && y === D) || (x === D && y === A) || (x === B && y === C) || (x === C && y === B)) {
                ok = false;
                break;
              }
            }
            if (ok) out.push({ cells: [A, B, C, D] });
          }
  });
  rectCache.set(s.g, out);
  return out;
}

function sharedUnits(s: SolverState, a: number, b: number) {
  return s.g.cellUnits[a].filter((u) => s.g.cellUnits[b].includes(u)).map((u) => s.g.units[u]);
}

export function findUR(s: SolverState, type: 1 | 2 | 3 | 4): Step | null {
  if (s.cages) return null;
  for (const rect of rectangles(s)) {
    const cs = rect.cells;
    if (cs.some((c) => s.val[c])) continue;
    const common = s.cand[cs[0]] & s.cand[cs[1]] & s.cand[cs[2]] & s.cand[cs[3]];
    if (POP[common] < 2) continue;
    const pairs: [number, number][] = [];
    const cd = DIGITS[common];
    for (let i = 0; i < cd.length; i++) for (let j = i + 1; j < cd.length; j++) pairs.push([cd[i], cd[j]]);
    for (const [a, b] of pairs) {
      const ab = (1 << (a - 1)) | (1 << (b - 1));
      const floor = cs.filter((c) => s.cand[c] === ab);
      const roof = cs.filter((c) => s.cand[c] !== ab);
      const base = `唯一矩形：${cns(s.g, [...cs])} 四格构成矩形，只占两个宫${s.g.mode === 'jigsaw' ? '（区域）' : ''}，且都含候选 ${a}/${b}。如果这四格最终只填 ${a}、${b}，把 ${a}、${b} 对调仍是合法答案，题目就会有两个解——而本题唯一解，所以不能形成这种“致命模式”。`;
      const hl = (extraKeys: CellDigit[] = []) => ({
        area: [...cs],
        keys: cs.flatMap((c) => [
          { cell: c, digit: a },
          { cell: c, digit: b },
        ]),
        keys2: extraKeys,
      });
      if (type === 1 && floor.length === 3 && roof.length === 1) {
        const r = roof[0];
        const elims = [a, b].map((d) => ({ cell: r, digit: d }));
        return mk('ur1', elims, hl(), `${base}${cns(s.g, floor)} 只有 ${a}/${b}，因此 ${cn(s.g, r)} 不能是 ${a} 或 ${b}：${elimText(s.g, elims)}。`);
      }
      if (floor.length !== 2 || roof.length !== 2) continue;
      const [r1, r2] = roof;
      const units = sharedUnits(s, r1, r2);
      if (!units.length) continue; // 屋顶两格必须同处某单元（非对角）
      const e1 = s.cand[r1] & ~ab;
      const e2 = s.cand[r2] & ~ab;
      if (type === 2 && e1 === e2 && POP[e1] === 1) {
        const x = DIGITS[e1][0];
        const elims = s
          .commonPeers([r1, r2])
          .filter((c) => s.has(c, x))
          .map((c) => ({ cell: c, digit: x }));
        if (!elims.length) continue;
        return mk(
          'ur2',
          elims,
          hl([
            { cell: r1, digit: x },
            { cell: r2, digit: x },
          ]),
          `${base}${cn(s.g, r1)} 和 ${cn(s.g, r2)} 都多了同一个候选 ${x}，为了避免致命模式，其中一格必须是 ${x}。同时看到这两格的格不能是 ${x}：${elimText(s.g, elims)}。`,
        );
      }
      if (type === 4) {
        for (const u of units) {
          for (const [x, y] of [
            [a, b],
            [b, a],
          ]) {
            const pos = s.positions(u, x);
            if (pos.length !== 2 || !pos.includes(r1) || !pos.includes(r2)) continue;
            const elims = [r1, r2].filter((c) => s.has(c, y)).map((c) => ({ cell: c, digit: y }));
            if (!elims.length) continue;
            return mk(
              'ur4',
              elims,
              hl(),
              `${base}在${un(s.g, u)}中，${x} 只能出现在 ${cn(s.g, r1)} 或 ${cn(s.g, r2)}，所以两格之一必是 ${x}。若这两格中再出现 ${y} 就会形成致命模式，因此 ${elimText(s.g, elims)}。`,
            );
          }
        }
      }
      if (type === 3) {
        const E = e1 | e2;
        if (POP[E] < 2) continue;
        for (const u of units) {
          const others = u.cells.filter((c) => !s.val[c] && c !== r1 && c !== r2);
          // 与“虚拟格”(候选 E) 组成显性数组
          for (let k = 2; k <= 4; k++) {
            const found = pickSubset(s, others, k - 1, E, k);
            if (!found) continue;
            const m = found.mask;
            const elims: CellDigit[] = [];
            for (const c of others) {
              if (found.cells.includes(c)) continue;
              for (const d of DIGITS[s.cand[c] & m]) elims.push({ cell: c, digit: d });
            }
            if (!elims.length) continue;
            return mk(
              'ur3',
              elims,
              hl([...found.cells.flatMap((c) => DIGITS[s.cand[c]].map((d) => ({ cell: c, digit: d })))]),
              `${base}为避免致命模式，${cn(s.g, r1)}、${cn(s.g, r2)} 中至少一格要填额外候选 ${DIGITS[E].join('/')} 之一，可把两格看成一个候选为 ${DIGITS[E].join('/')} 的“虚拟格”。它与${un(s.g, u)}中的 ${cns(
                s.g,
                found.cells,
              )} 组成显性数组 ${DIGITS[m].join('/')}，所以该单元的其他格不能是这些数字：${elimText(s.g, elims)}。`,
            );
          }
        }
      }
    }
  }
  return null;
}

function pickSubset(
  s: SolverState,
  pool: number[],
  count: number,
  baseMask: number,
  k: number,
): { cells: number[]; mask: number } | null {
  const pick: number[] = [];
  const rec = (start: number, mask: number): { cells: number[]; mask: number } | null => {
    if (POP[mask] > k) return null;
    if (pick.length === count) return POP[mask] === k ? { cells: pick.slice(), mask } : null;
    for (let i = start; i < pool.length; i++) {
      const c = pool[i];
      if (POP[s.cand[c]] > k) continue;
      pick.push(c);
      const r = rec(i + 1, mask | s.cand[c]);
      pick.pop();
      if (r) return r;
    }
    return null;
  };
  // 至少要剩一格可删
  if (pool.length <= count) return null;
  return rec(0, baseMask);
}

function mk(tech: TechId, elims: CellDigit[], highlight: Step['highlight'], text: string): Step {
  return { tech, placements: [], eliminations: elims, highlight, text };
}

/** BUG+1：除一格有 3 个候选外，其余空格都只有 2 个候选，且每个单元里每个候选恰好出现 0 或 2 次 */
export function findBUG(s: SolverState): Step | null {
  if (s.cages) return null;
  let tri = -1;
  for (let c = 0; c < s.n; c++) {
    if (s.val[c]) continue;
    const p = POP[s.cand[c]];
    if (p === 2) continue;
    if (p === 3 && tri === -1) tri = c;
    else return null;
  }
  if (tri === -1) return null;
  for (const x of DIGITS[s.cand[tri]]) {
    // 假设 tri 去掉 x 后，检查是否为 BUG 状态
    const saved = s.cand[tri];
    s.cand[tri] = saved & ~(1 << (x - 1));
    let bug = true;
    for (const u of s.g.units) {
      for (let d = 1; d <= 9 && bug; d++) {
        const n = s.positions(u, d).length;
        if (n !== 0 && n !== 2) bug = false;
      }
      if (!bug) break;
    }
    s.cand[tri] = saved;
    if (!bug) continue;
    return {
      tech: 'bug1',
      placements: [{ cell: tri, digit: x }],
      eliminations: [],
      highlight: { area: [tri], keys: [{ cell: tri, digit: x }] },
      text: `BUG+1：除了 ${cn(s.g, tri)} 有 3 个候选外，所有空格都只剩 2 个候选。若 ${cn(
        s.g,
        tri,
      )} 不是 ${x}，全盘会变成“每个单元每个候选恰好出现两次”的 BUG 状态，这种状态要么无解、要么至少两解，与唯一解矛盾。所以 ${cn(s.g, tri)} = ${x}。`,
    };
  }
  return null;
}

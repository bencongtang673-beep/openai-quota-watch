// XY-Wing、XYZ-Wing、W-Wing
import { DIGITS, POP } from '../bits';
import { cn, elimText, un } from './fmt';
import type { CellDigit, SolverState, Step } from './state';

function bivalues(s: SolverState): number[] {
  const out: number[] = [];
  for (let c = 0; c < s.n; c++) if (!s.val[c] && POP[s.cand[c]] === 2) out.push(c);
  return out;
}

export function findXYWing(s: SolverState): Step | null {
  const bv = bivalues(s);
  for (const pivot of bv) {
    const [x, y] = DIGITS[s.cand[pivot]];
    const wings = bv.filter((c) => c !== pivot && s.sees(c, pivot));
    for (const a of wings) {
      // a = {x, z}
      if (!(s.has(a, x) && !s.has(a, y))) continue;
      const z = DIGITS[s.cand[a] & ~(1 << (x - 1))][0];
      for (const b of wings) {
        if (b === a) continue;
        if (s.cand[b] !== ((1 << (y - 1)) | (1 << (z - 1)))) continue;
        const elims: CellDigit[] = s
          .commonPeers([a, b])
          .filter((c) => c !== pivot && s.has(c, z))
          .map((c) => ({ cell: c, digit: z }));
        if (!elims.length) continue;
        return {
          tech: 'xy_wing',
          placements: [],
          eliminations: elims,
          highlight: {
            area: [pivot, a, b, ...elims.map((e) => e.cell)],
            keys: [
              { cell: pivot, digit: x },
              { cell: pivot, digit: y },
              { cell: a, digit: x },
              { cell: b, digit: y },
            ],
            keys2: [
              { cell: a, digit: z },
              { cell: b, digit: z },
            ],
          },
          text: `XY-Wing：枢纽 ${cn(s.g, pivot)} 只有 ${x}/${y} 两个候选，它能看到 ${cn(s.g, a)}（${x}/${z}）和 ${cn(s.g, b)}（${y}/${z}）。枢纽若是 ${x}，${cn(s.g, a)} 就是 ${z}；枢纽若是 ${y}，${cn(s.g, b)} 就是 ${z}。无论哪种情况两翼之一必为 ${z}，所以同时看到两翼的格不能是 ${z}：${elimText(s.g, elims)}。`,
        };
      }
    }
  }
  return null;
}

export function findXYZWing(s: SolverState): Step | null {
  const bv = bivalues(s);
  for (let pivot = 0; pivot < s.n; pivot++) {
    if (s.val[pivot] || POP[s.cand[pivot]] !== 3) continue;
    const pm = s.cand[pivot];
    const wings = bv.filter((c) => s.sees(c, pivot) && (s.cand[c] & pm) === s.cand[c]);
    for (let i = 0; i < wings.length; i++)
      for (let j = i + 1; j < wings.length; j++) {
        const a = wings[i];
        const b = wings[j];
        if (s.cand[a] === s.cand[b]) continue;
        const common = s.cand[a] & s.cand[b];
        if (POP[common] !== 1) continue;
        const z = DIGITS[common][0];
        const elims: CellDigit[] = s
          .commonPeers([pivot, a, b])
          .filter((c) => s.has(c, z))
          .map((c) => ({ cell: c, digit: z }));
        if (!elims.length) continue;
        return {
          tech: 'xyz_wing',
          placements: [],
          eliminations: elims,
          highlight: {
            area: [pivot, a, b, ...elims.map((e) => e.cell)],
            keys: [pivot, a, b].flatMap((c) => DIGITS[s.cand[c]].filter((d) => d !== z).map((d) => ({ cell: c, digit: d }))),
            keys2: [pivot, a, b].map((c) => ({ cell: c, digit: z })),
          },
          text: `XYZ-Wing：枢纽 ${cn(s.g, pivot)} 有候选 ${DIGITS[pm].join('/')}，两翼 ${cn(s.g, a)}（${DIGITS[s.cand[a]].join('/')}）和 ${cn(
            s.g,
            b,
          )}（${DIGITS[s.cand[b]].join('/')}）都能被枢纽看到。三格中必有一格是 ${z}，所以同时看到这三格的格不能是 ${z}：${elimText(
            s.g,
            elims,
          )}。`,
        };
      }
  }
  return null;
}

/** W-Wing：两个候选相同 {x,y} 的双值格互不相见，由数字 x 的一条强链连接 → 同时看到两格的格删 y */
export function findWWing(s: SolverState): Step | null {
  const bv = bivalues(s);
  for (let i = 0; i < bv.length; i++)
    for (let j = i + 1; j < bv.length; j++) {
      const a = bv[i];
      const b = bv[j];
      if (s.cand[a] !== s.cand[b] || s.sees(a, b)) continue;
      const [d1, d2] = DIGITS[s.cand[a]];
      for (const [x, y] of [
        [d1, d2],
        [d2, d1],
      ]) {
        const targets = s.commonPeers([a, b]).filter((c) => s.has(c, y));
        if (!targets.length) continue;
        for (const u of s.g.units) {
          const pos = s.positions(u, x);
          if (pos.length !== 2) continue;
          const [p, q] = pos;
          if (p === a || p === b || q === a || q === b) continue;
          let link: [number, number] | null = null;
          if (s.sees(p, a) && s.sees(q, b)) link = [p, q];
          else if (s.sees(q, a) && s.sees(p, b)) link = [q, p];
          if (!link) continue;
          const elims = targets.map((c) => ({ cell: c, digit: y }));
          return {
            tech: 'w_wing',
            placements: [],
            eliminations: elims,
            highlight: {
              area: [a, b, p, q, ...targets],
              units: [u.id],
              keys: [
                { cell: link[0], digit: x },
                { cell: link[1], digit: x },
              ],
              keys2: [
                { cell: a, digit: y },
                { cell: b, digit: y },
              ],
              links: [
                { from: { cell: a, digit: x }, to: { cell: link[0], digit: x }, strong: false },
                { from: { cell: link[0], digit: x }, to: { cell: link[1], digit: x }, strong: true },
                { from: { cell: link[1], digit: x }, to: { cell: b, digit: x }, strong: false },
              ],
            },
            text: `W-Wing：${cn(s.g, a)} 与 ${cn(s.g, b)} 的候选都是 ${x}/${y}。在${un(s.g, u)}中，${x} 只能在 ${cn(s.g, link[0])} 或 ${cn(
              s.g,
              link[1],
            )}（强链）。假如两格都不是 ${y}，它们都得是 ${x}，那么 ${cn(s.g, link[0])} 和 ${cn(s.g, link[1])} 都不能是 ${x}，与强链矛盾。所以两格中至少一格是 ${y}，同时看到两格的格不能是 ${y}：${elimText(
              s.g,
              elims,
            )}。`,
          };
        }
      }
    }
  return null;
}

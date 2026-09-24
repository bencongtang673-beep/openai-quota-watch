// 鱼类技巧（只用于行、列；武士数独在各子盘内分别查找）：X-Wing(2)、剑鱼(3)、水母(4)。
import type { Unit } from '../types';
import { cns, elimText } from './fmt';
import type { CellDigit, SolverState, Step, TechId } from './state';

const FISH: Record<number, { id: TechId; name: string }> = {
  2: { id: 'x_wing', name: 'X-Wing' },
  3: { id: 'swordfish', name: '剑鱼' },
  4: { id: 'jellyfish', name: '水母' },
};

export function findFish(s: SolverState, k: number): Step | null {
  for (let gi = 0; gi < s.g.grids.length; gi++) {
    for (const orient of ['row', 'col'] as const) {
      const bases = orient === 'row' ? s.rows[gi] : s.cols[gi];
      const covers = orient === 'row' ? s.cols[gi] : s.rows[gi];
      const r = fishIn(s, k, bases, covers, gi, orient);
      if (r) return r;
    }
  }
  return null;
}

function fishIn(
  s: SolverState,
  k: number,
  bases: Unit[],
  covers: Unit[],
  gi: number,
  orient: 'row' | 'col',
): Step | null {
  for (let d = 1; d <= 9; d++) {
    // 每条基线上 d 的位置，用覆盖线下标的位掩码表示
    const lines: { u: Unit; mask: number; cells: number[] }[] = [];
    for (const u of bases) {
      if (s.placedInUnit(u, d)) continue;
      const pos = s.positions(u, d);
      if (pos.length < 2 || pos.length > k) continue;
      let mask = 0;
      for (const c of pos) mask |= 1 << coverIndex(s, gi, c, orient);
      lines.push({ u, mask, cells: pos });
    }
    if (lines.length < k) continue;
    const pick: number[] = [];
    const rec = (start: number, mask: number): Step | null => {
      if (pick.length === k) {
        if (popc(mask) !== k) return null;
        const baseCells = new Set(pick.flatMap((i) => lines[i].cells));
        const elims: CellDigit[] = [];
        const coverUnits: Unit[] = [];
        for (let ci = 0; ci < 9; ci++) {
          if (!(mask & (1 << ci))) continue;
          const cu = covers[ci];
          coverUnits.push(cu);
          for (const c of cu.cells) if (!baseCells.has(c) && !s.val[c] && s.has(c, d)) elims.push({ cell: c, digit: d });
        }
        if (!elims.length) return null;
        const f = FISH[k];
        const baseNames = pick.map((i) => lines[i].u.index + 1).join('、');
        const coverNames = coverUnits.map((u) => u.index + 1).join('、');
        const lineWord = orient === 'row' ? '行' : '列';
        const coverWord = orient === 'row' ? '列' : '行';
        const prefix = s.g.mode === 'samurai' ? `（${['左上', '右上', '中', '左下', '右下'][gi]}盘）` : '';
        return {
          tech: f.id,
          placements: [],
          eliminations: elims,
          highlight: {
            area: [...new Set([...pick.flatMap((i) => lines[i].u.cells), ...coverUnits.flatMap((u) => u.cells)])],
            units: [...pick.map((i) => lines[i].u.id), ...coverUnits.map((u) => u.id)],
            keys: [...baseCells].map((c) => ({ cell: c, digit: d })),
          },
          text: `${f.name}${prefix}：在第 ${baseNames} ${lineWord}中，数字 ${d} 都只出现在第 ${coverNames} ${coverWord}（${cns(
            s.g,
            [...baseCells],
          )}）。这 ${k} ${lineWord}各需要一个 ${d}，且它们必然分别落在这 ${k} ${coverWord}上，于是这 ${k} ${coverWord}的 ${d} 已被占满，这些${coverWord}的其他格不能是 ${d}：${elimText(s.g, elims)}。`,
        };
      }
      for (let i = start; i < lines.length; i++) {
        const m2 = mask | lines[i].mask;
        if (popc(m2) > k) continue;
        pick.push(i);
        const r = rec(i + 1, m2);
        pick.pop();
        if (r) return r;
      }
      return null;
    };
    const r = rec(0, 0);
    if (r) return r;
  }
  return null;
}

function coverIndex(s: SolverState, gi: number, cell: number, orient: 'row' | 'col'): number {
  const rc = s.rc[gi].get(cell)!;
  return orient === 'row' ? rc[1] : rc[0];
}

function popc(m: number): number {
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}

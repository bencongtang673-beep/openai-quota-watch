// 单数字技巧：摩天楼、双线风筝、空矩形、简单染色
import type { Unit } from '../types';
import { cn, cns, elimText, un } from './fmt';
import type { CellDigit, SolverState, Step } from './state';

interface StrongLink {
  u: Unit;
  p: number;
  q: number;
}

export function strongLinks(s: SolverState, d: number): StrongLink[] {
  const out: StrongLink[] = [];
  for (const u of s.g.units) {
    if (s.placedInUnit(u, d)) continue;
    const pos = s.positions(u, d);
    if (pos.length === 2) out.push({ u, p: pos[0], q: pos[1] });
  }
  return out;
}

/** 两格是否同处某个指定类型的单元（且属于指定子盘） */
function shareUnitOfType(s: SolverState, a: number, b: number, types: Unit['type'][], grid?: number): Unit | null {
  for (const uid of s.g.cellUnits[a]) {
    const u = s.g.units[uid];
    if (!types.includes(u.type)) continue;
    if (grid !== undefined && !u.grids.includes(grid)) continue;
    if (u.cells.includes(b)) return u;
  }
  return null;
}

function turbot(s: SolverState, kind: 'skyscraper' | 'kite'): Step | null {
  for (let d = 1; d <= 9; d++) {
    const links = strongLinks(s, d).filter((l) => l.u.type === 'row' || l.u.type === 'col');
    for (let i = 0; i < links.length; i++)
      for (let j = i + 1; j < links.length; j++) {
        const L1 = links[i];
        const L2 = links[j];
        if (L1.u.grid !== L2.u.grid && !L1.u.grids.some((x) => L2.u.grids.includes(x))) continue;
        const grid = L1.u.grids.find((x) => L2.u.grids.includes(x))!;
        const sameType = L1.u.type === L2.u.type;
        if (kind === 'skyscraper' && !sameType) continue;
        if (kind === 'kite' && sameType) continue;
        const cells = [L1.p, L1.q, L2.p, L2.q];
        if (new Set(cells).size < 4) continue;
        for (const [a1, a2] of [
          [L1.p, L1.q],
          [L1.q, L1.p],
        ])
          for (const [b1, b2] of [
            [L2.p, L2.q],
            [L2.q, L2.p],
          ]) {
            let via: Unit | null;
            if (kind === 'skyscraper') {
              const perp: Unit['type'] = L1.u.type === 'row' ? 'col' : 'row';
              via = shareUnitOfType(s, a1, b1, [perp], grid);
              // 两个“顶端”在同一条线上就是 X-Wing，不算摩天楼
              if (!via || shareUnitOfType(s, a2, b2, [perp], grid)) continue;
            } else {
              via = shareUnitOfType(s, a1, b1, ['box'], grid);
              if (!via) continue;
              // 风筝的两个“根”必须在同一宫但不在各自的强链线上
              if (L1.u.cells.includes(b1) || L2.u.cells.includes(a1)) continue;
            }
            const elims: CellDigit[] = s
              .commonPeers([a2, b2])
              .filter((c) => c !== a1 && c !== b1 && s.has(c, d))
              .map((c) => ({ cell: c, digit: d }));
            if (!elims.length) continue;
            const name = kind === 'skyscraper' ? '摩天楼' : '双线风筝';
            return {
              tech: kind === 'skyscraper' ? 'skyscraper' : 'two_string_kite',
              placements: [],
              eliminations: elims,
              highlight: {
                area: [...new Set([...L1.u.cells, ...L2.u.cells, ...via.cells])],
                units: [L1.u.id, L2.u.id, via.id],
                keys: [a1, a2, b1, b2].map((c) => ({ cell: c, digit: d })),
                links: [
                  { from: { cell: a2, digit: d }, to: { cell: a1, digit: d }, strong: true },
                  { from: { cell: a1, digit: d }, to: { cell: b1, digit: d }, strong: false },
                  { from: { cell: b1, digit: d }, to: { cell: b2, digit: d }, strong: true },
                ],
              },
              text: `${name}（数字 ${d}）：${un(s.g, L1.u)}的 ${d} 只能在 ${cn(s.g, a1)} 或 ${cn(s.g, a2)}，${un(s.g, L2.u)}的 ${d} 只能在 ${cn(
                s.g,
                b1,
              )} 或 ${cn(s.g, b2)}。${cn(s.g, a1)} 与 ${cn(s.g, b1)} 同在${un(s.g, via)}，不可能同时是 ${d}，所以 ${cn(s.g, a2)} 和 ${cn(
                s.g,
                b2,
              )} 至少有一个是 ${d}。同时看到这两格的格不能是 ${d}：${elimText(s.g, elims)}。`,
            };
          }
      }
  }
  return null;
}

export const findSkyscraper = (s: SolverState) => turbot(s, 'skyscraper');
export const findKite = (s: SolverState) => turbot(s, 'kite');

/** 空矩形：宫内 d 的候选全部落在某行 r ∪ 某列 c 上，再配合一条强链 */
export function findEmptyRectangle(s: SolverState): Step | null {
  for (let d = 1; d <= 9; d++) {
    const links = strongLinks(s, d).filter((l) => l.u.type === 'row' || l.u.type === 'col');
    for (const box of s.boxes) {
      if (s.placedInUnit(box, d)) continue;
      const pos = s.positions(box, d);
      if (pos.length < 2) continue;
      for (const gi of box.grids) {
        const rcOf = (c: number) => s.rc[gi].get(c);
        const boxRows = new Set(pos.map((c) => rcOf(c)![0]));
        const boxCols = new Set(pos.map((c) => rcOf(c)![1]));
        // 只保留真正的“十字”：需同时有行、列两个方向
        if (boxRows.size < 2 || boxCols.size < 2) continue;
        const rowsOfBox = new Set(box.cells.map((c) => rcOf(c)![0]));
        const colsOfBox = new Set(box.cells.map((c) => rcOf(c)![1]));
        for (const r of rowsOfBox)
          for (const c of colsOfBox) {
            if (!pos.every((p) => rcOf(p)![0] === r || rcOf(p)![1] === c)) continue;
            // 强链在某列 C（盒外）：P,Q；Q 在行 r → 删除 (row(P), c)
            for (const L of links) {
              if (!L.u.grids.includes(gi)) continue;
              for (const [P, Q] of [
                [L.p, L.q],
                [L.q, L.p],
              ]) {
                if (box.cells.includes(P) || box.cells.includes(Q)) continue;
                const rp = rcOf(P);
                const rq = rcOf(Q);
                if (!rp || !rq) continue;
                let target: number | undefined;
                let erLine: string;
                if (L.u.type === 'col') {
                  if (rq[0] !== r) continue;
                  target = s.g.grids[gi].cells[rp[0] * 9 + c];
                  erLine = `第${r + 1}行`;
                } else {
                  if (rq[1] !== c) continue;
                  target = s.g.grids[gi].cells[r * 9 + rp[1]];
                  erLine = `第${c + 1}列`;
                }
                if (target === undefined || target === P || box.cells.includes(target)) continue;
                if (s.val[target] || !s.has(target, d)) continue;
                const elims = [{ cell: target, digit: d }];
                return {
                  tech: 'empty_rectangle',
                  placements: [],
                  eliminations: elims,
                  highlight: {
                    area: [...new Set([...box.cells, ...L.u.cells, target])],
                    units: [box.id, L.u.id],
                    keys: [...pos, P, Q].map((x) => ({ cell: x, digit: d })),
                  },
                  text: `空矩形（数字 ${d}）：${un(s.g, box)}里的 ${d} 全部位于第${r + 1}行与第${c + 1}列组成的“十字”上（${cns(
                    s.g,
                    pos,
                  )}）。${un(s.g, L.u)}的 ${d} 只能在 ${cn(s.g, P)} 或 ${cn(s.g, Q)}。若 ${cn(s.g, target)} 是 ${d}，则 ${cn(s.g, P)} 不是 ${d}，于是 ${cn(
                    s.g,
                    Q,
                  )} 是 ${d}，它会排除宫内${erLine}上的 ${d}，宫里的 ${d} 只能落在 ${cn(s.g, target)} 所在的线上——与 ${cn(
                    s.g,
                    target,
                  )} 是 ${d} 冲突。所以 ${elimText(s.g, elims)}。`,
                };
              }
            }
          }
      }
    }
  }
  return null;
}

/** 简单染色：数字 d 的强链图二染色；同色互见 → 该色全假；看到两种颜色的格 → 删 */
export function findSimpleColoring(s: SolverState): Step | null {
  for (let d = 1; d <= 9; d++) {
    const links = strongLinks(s, d);
    if (links.length < 2) continue;
    const adj = new Map<number, number[]>();
    for (const l of links) {
      if (!adj.has(l.p)) adj.set(l.p, []);
      if (!adj.has(l.q)) adj.set(l.q, []);
      adj.get(l.p)!.push(l.q);
      adj.get(l.q)!.push(l.p);
    }
    const color = new Map<number, number>();
    for (const start of adj.keys()) {
      if (color.has(start)) continue;
      const comp: number[] = [];
      color.set(start, 0);
      const queue = [start];
      while (queue.length) {
        const x = queue.shift()!;
        comp.push(x);
        for (const y of adj.get(x)!) {
          if (!color.has(y)) {
            color.set(y, 1 - color.get(x)!);
            queue.push(y);
          }
        }
      }
      if (comp.length < 3) continue;
      const A = comp.filter((c) => color.get(c) === 0);
      const B = comp.filter((c) => color.get(c) === 1);
      const compLinks = links
        .filter((l) => comp.includes(l.p))
        .map((l) => ({ from: { cell: l.p, digit: d }, to: { cell: l.q, digit: d }, strong: true }));
      // 同色互见（颜色矛盾）
      for (const [X, Y, nx] of [
        [A, B, '甲'],
        [B, A, '乙'],
      ] as const) {
        let clash: [number, number] | null = null;
        for (let i = 0; i < X.length && !clash; i++)
          for (let j = i + 1; j < X.length; j++)
            if (s.sees(X[i], X[j])) {
              clash = [X[i], X[j]];
              break;
            }
        if (clash) {
          const elims = X.map((c) => ({ cell: c, digit: d }));
          return {
            tech: 'simple_coloring',
            placements: [],
            eliminations: elims,
            highlight: {
              area: comp,
              keys: X.map((c) => ({ cell: c, digit: d })),
              keys2: Y.map((c) => ({ cell: c, digit: d })),
              links: compLinks,
            },
            text: `简单染色（数字 ${d}）：沿着 ${d} 的强链（某单元里只剩两个位置）把格子交替染成两种颜色，同色的格要么全是 ${d}，要么全不是。${nx}色的 ${cn(
              s.g,
              clash[0],
            )} 和 ${cn(s.g, clash[1])} 互相能看到，不可能同时是 ${d}，所以${nx}色全部不是 ${d}：${elimText(s.g, elims)}。`,
          };
        }
      }
      // 看到两种颜色的格
      const elims: CellDigit[] = [];
      for (let c = 0; c < s.n; c++) {
        if (s.val[c] || !s.has(c, d) || color.has(c)) continue;
        if (A.some((a) => s.sees(c, a)) && B.some((b) => s.sees(c, b))) elims.push({ cell: c, digit: d });
      }
      if (elims.length) {
        return {
          tech: 'simple_coloring',
          placements: [],
          eliminations: elims,
          highlight: {
            area: [...comp, ...elims.map((e) => e.cell)],
            keys: A.map((c) => ({ cell: c, digit: d })),
            keys2: B.map((c) => ({ cell: c, digit: d })),
            links: compLinks,
          },
          text: `简单染色（数字 ${d}）：沿着 ${d} 的强链把格子交替染成甲、乙两色，两种颜色中必有一种全部是 ${d}。同时看到甲色格和乙色格的格无论如何都会被排除：${elimText(
            s.g,
            elims,
          )}。`,
        };
      }
    }
  }
  return null;
}

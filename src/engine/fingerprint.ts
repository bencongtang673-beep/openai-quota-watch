// 题目指纹：模式 + 区域布局 + 给定数 + 笼 → SHA-256。
// 经典/对角线/锯齿/武士：先按数字首次出现顺序重新编号，挡住“换数字标签”的伪新题。
// 杀手：数值有意义（笼和），不重新编号。
import { sha256Hex } from './sha256';
import type { Cage, Mode } from './types';

export function relabelByFirstOccurrence(givens: ArrayLike<number>): number[] {
  const map = new Array(10).fill(0);
  let next = 1;
  const out: number[] = [];
  for (let i = 0; i < givens.length; i++) {
    const d = givens[i];
    if (!d) {
      out.push(0);
      continue;
    }
    if (!map[d]) map[d] = next++;
    out.push(map[d]);
  }
  return out;
}

/** 区域布局规范化：按区域首次出现顺序编号（区域编号本身不影响题目）。 */
export function canonicalRegions(regions: number[]): number[] {
  const map = new Map<number, number>();
  return regions.map((r) => {
    if (!map.has(r)) map.set(r, map.size);
    return map.get(r)!;
  });
}

export function fingerprint(p: { mode: Mode; givens: ArrayLike<number>; regions?: number[]; cages?: Cage[] }): string {
  const parts: string[] = [p.mode];
  if (p.regions) parts.push('R' + canonicalRegions(p.regions).join(''));
  const givens = p.mode === 'killer' ? Array.from(p.givens) : relabelByFirstOccurrence(p.givens);
  parts.push('G' + givens.join(''));
  if (p.cages) {
    const cs = p.cages
      .map((c) => c.cells.slice().sort((a, b) => a - b).join('.') + '=' + c.sum)
      .sort();
    parts.push('C' + cs.join('|'));
  }
  return sha256Hex(parts.join('#'));
}

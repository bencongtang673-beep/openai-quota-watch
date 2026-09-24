import { describe, expect, it } from 'vitest';
import { getGeometry } from '../../src/engine/geometry';
import { buildModel, countSolutions, randomSolution } from '../../src/engine/solver';
import { dlxCount } from '../../src/engine/dlx';
import { createRng } from '../../src/engine/rng';
import { validateSolution } from '../../src/engine/validate';

const parse = (s: string) => s.split('').map((ch) => (ch === '.' || ch === '0' ? 0 : Number(ch)));

describe('唯一性求解器（双实现交叉验证）', () => {
  const g = getGeometry('classic');
  const m = buildModel(g);
  it('已知唯一解题', () => {
    const p = parse('53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79');
    const r = countSolutions(m, p);
    expect(r.count).toBe(1);
    expect(dlxCount(g, p)).toBe(1);
    expect(validateSolution(g, r.solution!)).toEqual([]);
  });
  it('多解题：两个求解器都返回 2', () => {
    const p = parse('.................................................................................');
    expect(countSolutions(m, p).count).toBe(2);
    expect(dlxCount(g, p)).toBe(2);
  });
  it('无解题：两个求解器都返回 0', () => {
    const p = parse('55...............................................................................');
    expect(countSolutions(m, p).count).toBe(0);
    expect(dlxCount(g, p)).toBe(0);
  });
  it('随机终盘合法且随机', () => {
    const rng = createRng(12345);
    const a = randomSolution(m, rng)!;
    const b = randomSolution(m, rng)!;
    expect(validateSolution(g, a)).toEqual([]);
    expect(validateSolution(g, b)).toEqual([]);
    expect(a.join('')).not.toBe(b.join(''));
  });
  it('对角线与武士终盘', () => {
    const rng = createRng(7);
    for (const mode of ['diagonal', 'samurai'] as const) {
      const gg = getGeometry(mode);
      const s = randomSolution(buildModel(gg), rng)!;
      expect(s).not.toBeNull();
      expect(validateSolution(gg, s)).toEqual([]);
    }
  });
});

describe('杀手：两个求解器在随机笼布局上结果一致（含多解与无解）', () => {
  it('30 组随机笼（多数不唯一）解数一致', async () => {
    const { generateCages } = await import('../../src/engine/killer-gen');
    const g = getGeometry('killer');
    const rng = createRng(2024);
    let multi = 0;
    for (let i = 0; i < 30; i++) {
      const sol = randomSolution(buildModel(g), rng)!;
      const cages = generateCages(sol, rng, ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5);
      const givens = new Array(81).fill(0);
      // 随机给几个数，让搜索规模可控
      for (let k = 0; k < 6; k++) {
        const c = rng.int(81);
        givens[c] = sol[c];
      }
      if (i % 7 === 0) givens[rng.int(81)] = 0;
      const a = countSolutions(buildModel(g, cages), givens, { limit: 2 }).count;
      const b = dlxCount(g, givens, cages, 2);
      expect(a).toBe(b);
      if (a === 2) multi++;
      // 破坏笼和 → 两者都应无解
      const bad = cages.map((c, j) => (j === 0 ? { ...c, sum: c.sum + 1 } : c));
      expect(countSolutions(buildModel(g, bad), givens, { limit: 2 }).count).toBe(dlxCount(g, givens, bad, 2));
    }
    expect(multi).toBeGreaterThan(0);
  });
});

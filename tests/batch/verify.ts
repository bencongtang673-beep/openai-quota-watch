// 批量验收：逐题检查（独立校验器、双求解器唯一解、给定数一致、技巧求解器不靠猜解完且档位一致、指纹不重复、结构检查）。
import { expect } from 'vitest';
import { dlxCount } from '../../src/engine/dlx';
import { fingerprint } from '../../src/engine/fingerprint';
import { generate } from '../../src/engine/generate';
import { getGeometry } from '../../src/engine/geometry';
import { rate } from '../../src/engine/human/solver';
import { buildModel, countSolutions } from '../../src/engine/solver';
import type { Level, Mode, PuzzleData } from '../../src/engine/types';
import { isConnected, validateRegions, validateSolution } from '../../src/engine/validate';

export const FULL = process.env.FULL_SAMPLE === '1';

export interface BatchStats {
  mode: Mode;
  level: Level;
  count: number;
  medianMs: number;
  maxMs: number;
  avgSteps: number;
  avgScore: number;
  avgGivens: number;
  failures: number;
}

export function verifyPuzzle(p: PuzzleData, seen: Set<string>) {
  const g = getGeometry(p.mode, p.regions);
  // 结构
  if (p.mode === 'jigsaw') expect(validateRegions(p.regions!)).toEqual([]);
  if (p.mode === 'killer') {
    const cover = new Array(81).fill(0);
    for (const cg of p.cages!) {
      expect(isConnected(cg.cells)).toBe(true);
      const digits = cg.cells.map((c) => p.solution[c]);
      expect(new Set(digits).size).toBe(digits.length);
      expect(digits.reduce((a, b) => a + b, 0)).toBe(cg.sum);
      for (const c of cg.cells) cover[c]++;
    }
    expect(cover.every((x) => x === 1)).toBe(true);
  }
  if (p.mode === 'samurai') {
    // 共享宫在两个子盘中是同一组格子，数字自然一致；这里显式按子盘坐标逐格比对
    const pairs: [number, number, number, number][] = [
      [0, 8, 2, 0],
      [1, 6, 2, 2],
      [3, 2, 2, 6],
      [4, 0, 2, 8],
    ];
    for (const [ga, ba, gb, bb] of pairs) {
      const boxCells = (gi: number, b: number) => {
        const out: number[] = [];
        for (let i = 0; i < 81; i++) {
          const r = Math.floor(i / 9), c = i % 9;
          if (Math.floor(r / 3) * 3 + Math.floor(c / 3) === b) out.push(g.grids[gi].cells[i]);
        }
        return out;
      };
      const A = boxCells(ga, ba).map((c) => p.solution[c]);
      const B = boxCells(gb, bb).map((c) => p.solution[c]);
      expect(A).toEqual(B);
    }
  }
  // 独立校验器
  expect(validateSolution(g, p.solution, p.cages)).toEqual([]);
  // 给定数与答案一致
  for (let i = 0; i < g.size; i++) if (p.givens[i]) expect(p.givens[i]).toBe(p.solution[i]);
  // 双求解器唯一
  const a = countSolutions(buildModel(g, p.cages), p.givens, { limit: 2 });
  expect(a.count).toBe(1);
  expect(a.solution).toEqual(p.solution);
  expect(dlxCount(g, p.givens, p.cages, 2)).toBe(1);
  // 经典唯一解题给定数不可能少于 17
  if (p.mode === 'classic') expect(p.givens.filter(Boolean).length).toBeGreaterThanOrEqual(17);
  // 技巧求解器：每步与答案一致、不靠猜解完、档位一致
  const r = rate(g, p.givens, p.cages, { solution: p.solution });
  expect(r.solved).toBe(true);
  expect(r.broken).toBe(false);
  expect(r.level).toBe(p.level);
  expect(r.score).toBe(p.score);
  // 指纹
  expect(fingerprint({ mode: p.mode, givens: p.givens, regions: p.regions, cages: p.cages })).toBe(p.fingerprint);
  expect(seen.has(p.fingerprint)).toBe(false);
  seen.add(p.fingerprint);
  return r;
}

export function runBatch(mode: Mode, level: Level, count: number, seedBase: number, timeLimitMs = 120_000): BatchStats {
  const seen = new Set<string>();
  const times: number[] = [];
  let steps = 0;
  let score = 0;
  let givens = 0;
  let failures = 0;
  for (let i = 0; i < count; i++) {
    const t = performance.now();
    const p = generate({ mode, level, seed: seedBase + i * 7919, exclude: seen, timeLimitMs });
    times.push(performance.now() - t);
    if (!p) {
      failures++;
      continue;
    }
    const r = verifyPuzzle(p, seen);
    steps += r.steps;
    score += r.score;
    givens += p.givens.filter(Boolean).length;
  }
  times.sort((a, b) => a - b);
  const ok = count - failures;
  return {
    mode,
    level,
    count,
    medianMs: Math.round(times[Math.floor(times.length / 2)]),
    maxMs: Math.round(times[times.length - 1]),
    avgSteps: +(steps / Math.max(1, ok)).toFixed(1),
    avgScore: +(score / Math.max(1, ok)).toFixed(1),
    avgGivens: +(givens / Math.max(1, ok)).toFixed(1),
    failures,
  };
}

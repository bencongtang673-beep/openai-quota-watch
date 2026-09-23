// 杀手笼生成：从终盘随机生长。笼连通、笼内数字不重复、以 2–4 格为主、偶尔 5 格、尽量没有单格笼。
import type { Rng } from './rng';
import type { Cage, Level } from './types';

/** 各档笼大小分布（权重对应 2,3,4,5 格） */
const SIZE_WEIGHTS: Record<Level, number[]> = {
  1: [6, 3, 1, 0],
  2: [5, 4, 1, 0],
  3: [4, 4, 2, 0.5],
  4: [3, 4, 3, 1],
  5: [3, 4, 3, 1],
};

function pickSize(rng: Rng, level: Level): number {
  const w = SIZE_WEIGHTS[level];
  const total = w.reduce((a, b) => a + b, 0);
  let x = rng.next() * total;
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x < 0) return i + 2;
  }
  return 2;
}

function nbrs(c: number): number[] {
  const r = Math.floor(c / 9);
  const col = c % 9;
  const out: number[] = [];
  if (r > 0) out.push(c - 9);
  if (r < 8) out.push(c + 9);
  if (col > 0) out.push(c - 1);
  if (col < 8) out.push(c + 1);
  return out;
}

export function generateCages(solution: number[], rng: Rng, level: Level): Cage[] {
  const owner = new Int16Array(81).fill(-1);
  const cages: number[][] = [];
  const freeNbrs = (c: number) => nbrs(c).filter((x) => owner[x] === -1);
  for (;;) {
    const free: number[] = [];
    for (let i = 0; i < 81; i++) if (owner[i] === -1) free.push(i);
    if (!free.length) break;
    // 优先从“孤立风险高”（空闲邻居最少）的格开始生长，减少单格笼
    let minN = 5;
    for (const c of free) minN = Math.min(minN, freeNbrs(c).length);
    const pool = free.filter((c) => freeNbrs(c).length === minN);
    const seed = pool[rng.int(pool.length)];
    const target = pickSize(rng, level);
    const cells = [seed];
    owner[seed] = cages.length;
    let used = 1 << (solution[seed] - 1);
    while (cells.length < target) {
      const options: number[] = [];
      for (const c of cells)
        for (const x of freeNbrs(c)) if (!(used & (1 << (solution[x] - 1))) && !options.includes(x)) options.push(x);
      if (!options.length) break;
      // 倾向选择空闲邻居少的格，避免把别的格困成孤岛
      options.sort((a, b) => freeNbrs(a).length - freeNbrs(b).length);
      const pickFrom = options.slice(0, Math.max(1, Math.ceil(options.length / 2)));
      const x = pickFrom[rng.int(pickFrom.length)];
      cells.push(x);
      owner[x] = cages.length;
      used |= 1 << (solution[x] - 1);
    }
    cages.push(cells);
  }
  // 合并单格笼：并入相邻、数字不冲突、不超过 5 格的笼
  for (let ci = 0; ci < cages.length; ci++) {
    if (cages[ci].length !== 1) continue;
    const c = cages[ci][0];
    const opts = rng.shuffle(nbrs(c).map((x) => owner[x]).filter((o) => o !== ci));
    for (const o of opts) {
      const target = cages[o];
      if (target.length >= 5) continue;
      if (target.some((x) => solution[x] === solution[c])) continue;
      target.push(c);
      owner[c] = o;
      cages[ci] = [];
      break;
    }
  }
  return cages
    .filter((cells) => cells.length > 0)
    .map((cells) => {
      const sorted = cells.slice().sort((a, b) => a - b);
      return { cells: sorted, sum: sorted.reduce((s, c) => s + solution[c], 0) };
    });
}

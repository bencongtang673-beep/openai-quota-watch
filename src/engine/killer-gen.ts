// 杀手笼生成：从终盘随机生长。笼连通、笼内数字不重复、以 2–4 格为主、偶尔 5 格、尽量没有单格笼。
import { COMBOS } from './combos';
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
      let pickFrom = options.slice(0, Math.max(1, Math.ceil(options.length / 2)));
      // 低档：优先让笼形成“唯一组合”（如 2 格和 3/4/16/17），降低需要的给定数
      if (level <= 2) {
        const sum = cells.reduce((acc, c) => acc + solution[c], 0);
        const uniq = options.filter((x) => COMBOS[cells.length + 1][sum + solution[x]].length === 1);
        if (uniq.length) pickFrom = uniq;
        else if (cells.length >= 2 && COMBOS[cells.length][sum].length === 1 && rng.next() < 0.7) break;
      }
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

/**
 * 纯杀手不唯一时“优先重新分笼”：拿到两个不同的解，在两解不同的格附近调整笼边界
 * （把一个差异格移到相邻笼、或把大笼切开），让另一个解违反笼和。返回新笼或 null（无法调整）。
 */
export function recage(cages: Cage[], solution: number[], other: number[], rng: Rng): Cage[] | null {
  const owner = new Int16Array(81).fill(-1);
  const groups = cages.map((c) => c.cells.slice());
  groups.forEach((cells, i) => cells.forEach((c) => (owner[c] = i)));
  const diff: number[] = [];
  for (let c = 0; c < 81; c++) if (solution[c] !== other[c]) diff.push(c);
  rng.shuffle(diff);
  for (const c of diff) {
    const from = owner[c];
    const src = groups[from];
    if (src.length < 2) continue;
    const rest = src.filter((x) => x !== c);
    if (!connected(rest)) continue;
    const targets = rng.shuffle(nbrs(c).map((x) => owner[x]).filter((o, i, a) => o !== from && a.indexOf(o) === i));
    for (const to of targets) {
      const dst = groups[to];
      if (dst.length >= 5) continue;
      if (dst.some((x) => solution[x] === solution[c])) continue;
      groups[from] = rest;
      groups[to] = [...dst, c];
      return finalize(groups, solution);
    }
  }
  // 退路：把含差异格的最大笼切成两个连通部分
  for (const c of diff) {
    const src = groups[owner[c]];
    if (src.length < 4) continue;
    for (const x of src) {
      const part = src.filter((y) => y !== x);
      // 以 x 为中心取它自己 + 一个邻居，剩余部分须连通
      for (const y of nbrs(x)) {
        if (!part.includes(y)) continue;
        const a = [x, y];
        const b = src.filter((z) => !a.includes(z));
        if (b.length >= 2 && connected(b)) {
          const idx = owner[c];
          groups[idx] = a;
          groups.push(b);
          return finalize(groups, solution);
        }
      }
    }
  }
  return null;
}

function finalize(groups: number[][], solution: number[]): Cage[] {
  return groups
    .filter((g) => g.length)
    .map((cells) => {
      const sorted = cells.slice().sort((a, b) => a - b);
      return { cells: sorted, sum: sorted.reduce((s, c) => s + solution[c], 0) };
    });
}

function connected(cells: number[]): boolean {
  if (!cells.length) return false;
  const set = new Set(cells);
  const seen = new Set([cells[0]]);
  const st = [cells[0]];
  while (st.length) {
    const c = st.pop()!;
    for (const n of nbrs(c)) if (set.has(n) && !seen.has(n)) {
      seen.add(n);
      st.push(n);
    }
  }
  return seen.size === cells.length;
}

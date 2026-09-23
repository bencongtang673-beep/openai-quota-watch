// 出题流水线：终盘（随机候选 + MRV 回溯）→ 挖空（每挖一次查唯一性）→ 人类技巧评级 → 不符目标档位就重试。
// 以生成器函数实现：Worker 中一口气跑完；主线程降级模式按 ≤16ms 分片执行。
import { fingerprint } from './fingerprint';
import { getGeometry, STANDARD_BOXES, type Geometry } from './geometry';
import { rateIter, type RatingResult } from './human/solver';
import { SolverState } from './human/state';
import { generateCages, recage } from './killer-gen';
import { createRng, randomSeed, type Rng } from './rng';
import { buildModel, countSolutions, randomSolution, type Model } from './solver';
import { isConnected } from './validate';
import type { Cage, Level, Mode, PuzzleData } from './types';

export interface GenRequest {
  mode: Mode;
  level: Level;
  seed?: number;
  /** 已发放过的指纹（撞了就重新生成） */
  exclude?: Set<string>;
  /** 超时（毫秒）：超时返回 null，绝不降档冒充 */
  timeLimitMs?: number;
}

export interface GenProgress {
  attempts: number;
  phase: 'layout' | 'solution' | 'cages' | 'dig' | 'rate';
  elapsedMs: number;
}

export type GenIter = Generator<GenProgress, PuzzleData | null, void>;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function generate(req: GenRequest): PuzzleData | null {
  const it = generateIter(req);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

export function* generateIter(req: GenRequest): GenIter {
  const rng = createRng(req.seed ?? randomSeed());
  const start = now();
  const deadline = start + (req.timeLimitMs ?? Infinity);
  let attempts = 0;
  const progress = (phase: GenProgress['phase']): GenProgress => ({ attempts, phase, elapsedMs: now() - start });

  while (now() < deadline) {
    attempts++;
    // 1. 区域布局（锯齿）
    let regions: number[] | undefined;
    if (req.mode === 'jigsaw') {
      regions = randomJigsawLayout(rng);
      yield progress('layout');
    }
    const g = getGeometry(req.mode, regions);
    const baseModel = buildModel(g);
    // 2. 终盘
    const solution = randomSolution(baseModel, rng, req.mode === 'jigsaw' ? 1_500 : 500_000);
    yield progress('solution');
    if (!solution) continue; // 锯齿布局限时内无终盘 → 换布局

    // 同一终盘上重试若干次（先重新挖空 / 重新分笼，再换终盘）
    const retries = req.mode === 'killer' ? 6 : req.mode === 'samurai' ? 3 : 8;
    for (let t = 0; t < retries && now() < deadline; t++) {
      let cages: Cage[] | undefined;
      let dug: DigResult | null;
      if (req.mode === 'killer') {
        const k = yield* killerIter(g, solution, req.level, rng, deadline, progress);
        if (!k) continue;
        cages = k.cages;
        dug = k;
      } else {
        dug = yield* digIter(g, baseModel, solution, req.level, rng, undefined, deadline, progress);
      }
      if (!dug) continue;
      const { givens, rating } = dug;
      if (!rating.solved || rating.level !== req.level) continue;
      const fp = fingerprint({ mode: req.mode, givens, regions, cages });
      if (req.exclude?.has(fp)) continue;
      return {
        mode: req.mode,
        regions,
        cages,
        givens,
        solution,
        level: req.level,
        score: rating.score,
        fingerprint: fp,
      };
    }
  }
  return null;
}

interface DigResult {
  givens: number[];
  rating: RatingResult;
}

/** 评级（每 8 个技巧步让出一次） */
function* rateGivens(
  g: Geometry,
  givens: number[],
  cages: Cage[] | undefined,
  maxLevel: Level,
): Generator<GenProgress, RatingResult, void> {
  const s = SolverState.fromValues(g, givens, cages);
  const it = rateIter(s, { maxLevel });
  let k = 0;
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (++k % 8 === 0) yield { attempts: 0, phase: 'rate', elapsedMs: 0 };
  }
}

/**
 * 挖空：按随机顺序去掉给定数；每次都检查唯一解；1–4 档同时要求“仍能用 ≤ 目标档的技巧解出”，
 * 挖到极小为止。5 档先只按唯一性挖到极小，再整体评级。
 */
function* digIter(
  g: Geometry,
  model: Model,
  solution: number[],
  level: Level,
  rng: Rng,
  cages: Cage[] | undefined,
  deadline: number,
  progress: (p: GenProgress['phase']) => GenProgress,
): Generator<GenProgress, DigResult | null, void> {
  const n = g.size;
  const givens = solution.slice();
  const killer = !!cages;
  // 2–4 档（非杀手）：先只按唯一性挖到极小，再“卡住就补一个给定数”修到目标档以内（快得多）
  if (!killer && level >= 2 && level <= 4) {
    const res = yield* digThenRepair(g, model, solution, level, rng, deadline, progress);
    return res;
  }
  const symmetric = level <= 3 && !killer && g.width === 9;
  const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  const done = new Uint8Array(n);
  const constrainLevel = level <= 4;
  let yieldCounter = 0;
  for (const c of order) {
    if (now() > deadline) return null;
    if (done[c]) continue;
    const group = [c];
    if (symmetric) {
      const mirror = 80 - c;
      if (mirror !== c) group.push(mirror);
    }
    for (const x of group) done[x] = 1;
    const saved = group.map((x) => givens[x]);
    for (const x of group) givens[x] = 0;
    const r = countSolutions(model, givens, { limit: 2 });
    let ok = r.count === 1;
    if (ok && constrainLevel) {
      const rating = yield* rateGivens(g, givens, cages, level);
      ok = rating.solved;
    }
    if (!ok) group.forEach((x, i) => (givens[x] = saved[i]));
    if (++yieldCounter % 2 === 0) yield progress('dig');
  }
  const rating = yield* rateGivens(g, givens, cages, 5);
  yield progress('rate');
  return { givens, rating };
}

/** 杀手每档允许补的给定数上限（4–5 档默认纯杀手，确实需要时才补且尽量少） */
const KILLER_MAX_GIVENS: Record<Level, number> = { 1: 30, 2: 20, 3: 12, 4: 3, 5: 3 };

function* killerIter(
  g: Geometry,
  solution: number[],
  level: Level,
  rng: Rng,
  deadline: number,
  progress: (p: GenProgress['phase']) => GenProgress,
): Generator<GenProgress, (DigResult & { cages: Cage[] }) | null, void> {
  const n = g.size;
  // 1. 分笼并反复“重新分笼”直到纯杀手唯一
  let cages = generateCages(solution, rng, level);
  const givens = new Array(n).fill(0);
  let added = 0;
  let unique = false;
  for (let it = 0; it < 40 && now() < deadline; it++) {
    // 节点上限：大多数笼布局几十到几百个节点就能判定；更难的布局直接放弃、换一套笼
    const r = countSolutions(buildModel(g, cages), givens, { limit: 2, nodeLimit: 1_500 });
    yield progress('cages');
    if (r.aborted) {
      // 太难证明唯一：低档允许补一个随机给定数再试；高档直接换一套笼
      if (level > 3 || ++added > KILLER_MAX_GIVENS[level]) break;
      const open: number[] = [];
      for (let c = 0; c < n; c++) if (!givens[c]) open.push(c);
      const c = open[rng.int(open.length)];
      givens[c] = solution[c];
      continue;
    }
    if (r.count === 1) {
      unique = true;
      break;
    }
    if (!r.second) break;
    const nc = recage(cages, solution, r.second, rng);
    if (nc) {
      cages = nc;
      continue;
    }
    // 无法再重新分笼时，才补一个给定数（放在两解不同的格上），计入本档给定数上限
    if (++added > KILLER_MAX_GIVENS[level]) break;
    const diff: number[] = [];
    for (let c = 0; c < n; c++) if (r.second[c] !== solution[c]) diff.push(c);
    const c = diff[rng.int(diff.length)];
    givens[c] = solution[c];
  }
  if (!unique) return null;
  const model = buildModel(g, cages);
  // 2. 用 ≤ 目标档技巧解；卡住才补一个正确给定数
  const s = SolverState.fromValues(g, givens, cages);
  while (!s.isSolved()) {
    if (now() > deadline) return null;
    const it = rateIter(s, { maxLevel: level });
    let r = it.next();
    let steps = 0;
    while (!r.done) {
      if (++steps % 8 === 0) yield progress('rate');
      r = it.next();
    }
    if (s.isSolved()) break;
    if (++added > KILLER_MAX_GIVENS[level]) return null;
    const open: number[] = [];
    for (let c = 0; c < n; c++) if (!s.val[c]) open.push(c);
    const c = open[rng.int(open.length)];
    givens[c] = solution[c];
    s.place(c, solution[c]);
  }
  let rating = yield* rateGivens(g, givens, cages, 5);
  // 3. 低于目标档时，尝试去掉补的给定数（保持唯一且 ≤ 目标档可解），达到目标档即停
  if (rating.solved && rating.level !== null && rating.level < level) {
    for (const c of rng.shuffle(Array.from({ length: n }, (_, i) => i))) {
      if (!givens[c]) continue;
      const v = givens[c];
      givens[c] = 0;
      const r2 = yield* rateGivens(g, givens, cages, level);
      if (!r2.solved || countSolutions(model, givens, { limit: 2 }).count !== 1) {
        givens[c] = v;
        continue;
      }
      if (r2.level === level) break;
    }
    rating = yield* rateGivens(g, givens, cages, 5);
  }
  return { givens, rating, cages };
}

function* digThenRepair(
  g: Geometry,
  model: Model,
  solution: number[],
  level: Level,
  rng: Rng,
  deadline: number,
  progress: (p: GenProgress['phase']) => GenProgress,
): Generator<GenProgress, DigResult | null, void> {
  const n = g.size;
  const givens = solution.slice();
  const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  let k = 0;
  for (const c of order) {
    if (now() > deadline) return null;
    const v = givens[c];
    givens[c] = 0;
    if (countSolutions(model, givens, { limit: 2 }).count !== 1) givens[c] = v;
    if (++k % 8 === 0) yield progress('dig');
  }
  // 用 ≤ 目标档的技巧解；卡住时随机补一个正确给定数并继续（补的数对之前的推理没有影响）
  const s = SolverState.fromValues(g, givens, undefined);
  let guard = 0;
  while (!s.isSolved() && guard++ < n) {
    const it = rateIter(s, { maxLevel: level });
    let r = it.next();
    let steps = 0;
    while (!r.done) {
      if (++steps % 16 === 0) yield progress('rate');
      r = it.next();
    }
    if (s.isSolved()) break;
    const open: number[] = [];
    for (let c = 0; c < n; c++) if (!s.val[c]) open.push(c);
    const c = open[rng.int(open.length)];
    givens[c] = solution[c];
    s.place(c, solution[c]);
  }
  let rating = yield* rateGivens(g, givens, undefined, 5);
  // 补数后若低于目标档：在“唯一 + 仍可用 ≤目标档技巧解出”的前提下继续去掉给定数，达到目标档即停
  if (rating.solved && rating.level !== null && rating.level < level) {
    for (const c of rng.shuffle(Array.from({ length: n }, (_, i) => i))) {
      if (now() > deadline) return null;
      if (!givens[c]) continue;
      const v = givens[c];
      givens[c] = 0;
      if (countSolutions(model, givens, { limit: 2 }).count !== 1) {
        givens[c] = v;
        continue;
      }
      const r2 = yield* rateGivens(g, givens, undefined, level);
      if (!r2.solved) {
        givens[c] = v;
        continue;
      }
      if (r2.level === level) break;
    }
    rating = yield* rateGivens(g, givens, undefined, 5);
  }
  yield progress('rate');
  return { givens, rating };
}

/** 锯齿区域：从标准 3×3 宫出发，随机交换相邻不同区域的边界格，保持两边区域连通 */
export function randomJigsawLayout(rng: Rng, swaps = 120): number[] {
  const reg = STANDARD_BOXES.slice();
  const cellsOf = (r: number) => reg.map((x, i) => (x === r ? i : -1)).filter((i) => i >= 0);
  let done = 0;
  let guard = 0;
  while (done < swaps && guard++ < swaps * 60) {
    const a = rng.int(81);
    const nbs = neighbors(a).filter((b) => reg[b] !== reg[a]);
    if (!nbs.length) continue;
    const b = nbs[rng.int(nbs.length)];
    // 找另一对：a 所在区 A 需要一个与 B 相邻的格 a' 换出去… 这里用“双格互换”：
    // 把 a 从 A 移到 B，同时把 B 中某个与 A 相邻的格 b' 移到 A，保证两区仍各 9 格
    const A = reg[a];
    const B = reg[b];
    const candidates = cellsOf(B).filter((x) => x !== b && neighbors(x).some((y) => reg[y] === A && y !== a));
    if (!candidates.length) continue;
    const b2 = candidates[rng.int(candidates.length)];
    reg[a] = B;
    reg[b2] = A;
    if (isConnected(cellsOf(A)) && isConnected(cellsOf(B))) done++;
    else {
      reg[a] = A;
      reg[b2] = B;
    }
  }
  return reg;
}

function neighbors(c: number): number[] {
  const r = Math.floor(c / 9);
  const col = c % 9;
  const out: number[] = [];
  if (r > 0) out.push(c - 9);
  if (r < 8) out.push(c + 9);
  if (col > 0) out.push(c - 1);
  if (col < 8) out.push(c + 1);
  return out;
}

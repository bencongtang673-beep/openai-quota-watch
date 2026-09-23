import { generate } from '../src/engine/generate';
import { getGeometry } from '../src/engine/geometry';
import { rate } from '../src/engine/human/solver';
import type { Level, Mode } from '../src/engine/types';
const mode = (process.argv[2] ?? 'classic') as Mode;
const levels = (process.argv[3] ?? '1,2,3,4,5').split(',').map(Number) as Level[];
const count = Number(process.argv[4] ?? 5);
for (const level of levels) {
  const times: number[] = [];
  let fails = 0;
  let givensSum = 0;
  for (let i = 0; i < count; i++) {
    const t = performance.now();
    const p = generate({ mode, level, seed: 1000 * level + i, timeLimitMs: 60000 });
    times.push(performance.now() - t);
    if (!p) { fails++; continue; }
    givensSum += p.givens.filter(Boolean).length;
    const g = getGeometry(mode, p.regions);
    const r = rate(g, p.givens, p.cages, { solution: p.solution });
    if (r.level !== level) throw new Error('level mismatch');
  }
  times.sort((a, b) => a - b);
  console.log(mode, 'L' + level, 'median', Math.round(times[times.length >> 1]), 'max', Math.round(times[times.length - 1]), 'fails', fails, 'avgGivens', (givensSum / (count - fails)).toFixed(1));
}

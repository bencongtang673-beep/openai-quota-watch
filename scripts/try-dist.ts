import { generate } from '../src/engine/generate';
import { getGeometry } from '../src/engine/geometry';
import { rate } from '../src/engine/human/solver';
import type { Level, Mode } from '../src/engine/types';
const mode = (process.argv[2] ?? 'classic') as Mode;
const level = Number(process.argv[3] ?? 5) as Level;
const agg: Record<string, number> = {};
for (let i = 0; i < 20; i++) {
  const p = generate({ mode, level, seed: 7 + i, timeLimitMs: 60000 })!;
  const r = rate(getGeometry(mode, p.regions), p.givens, p.cages);
  const hard = Object.keys(r.techCounts).filter((k) => !['hidden_single','full_house','naked_single'].includes(k));
  for (const k of hard) agg[k] = (agg[k] ?? 0) + 1;
  console.log(i, r.steps, r.score, hard.join(','));
}
console.log(agg);

// 从大量真实生成的题目中，为每种技巧抓取“它是下一步”的真实盘面快照，作为说明页的技巧示例。
// 只在开发时运行一次，产物 src/app/help/examples.json（教程插图，不是题库，不用于出题）。
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { generate } from '../src/engine/generate';
import { getGeometry } from '../src/engine/geometry';
import { FINDERS, nextStep } from '../src/engine/human/solver';
import { SolverState, TECHS, type Step, type TechId } from '../src/engine/human/state';
import type { Level, Mode } from '../src/engine/types';

interface Example {
  tech: TechId;
  mode: Mode;
  regions?: number[];
  cages?: { cells: number[]; sum: number }[];
  givens: number[];
  values: number[];
  cand: number[];
  step: Step;
}

const out: Record<string, Example> = existsSync('src/app/help/examples.json')
  ? JSON.parse(readFileSync('src/app/help/examples.json', 'utf8'))
  : {};
const mode = (process.argv[2] ?? 'classic') as Mode;
const budget = Number(process.argv[3] ?? 600);
const wanted = TECHS.filter((t) => (mode === 'killer' ? true : !t.killerOnly)).map((t) => t.id);
const score = (e: Example) => e.step.highlight.area.length + e.step.eliminations.length;
let seed = 1;
for (let i = 0; i < budget; i++) {
  const level = ([5, 5, 4, 3, 2] as Level[])[i % 5];
  const p = generate({ mode, level, seed: seed++ * 7777 + 13 });
  if (!p) continue;
  const g = getGeometry(mode, p.regions);
  const s = SolverState.fromValues(g, p.givens, p.cages);
  for (let k = 0; k < 400 && !s.isSolved(); k++) {
    // 对极少成为“下一步”的技巧（隐性四数组、水母），直接探测当前盘面是否可用（推理本身同样成立）
    for (const probe of ['hidden_quad', 'jellyfish'] as TechId[]) {
      if (out[probe] || !wanted.includes(probe)) continue;
      const ps = FINDERS[probe](s);
      if (ps) out[probe] = { tech: probe, mode, regions: p.regions, cages: p.cages, givens: p.givens, values: Array.from(s.val), cand: Array.from(s.cand), step: ps };
    }
    const st = nextStep(s);
    if (!st) break;
    const key = st.tech;
    const ex: Example = {
      tech: key,
      mode,
      regions: p.regions,
      cages: p.cages,
      givens: p.givens,
      values: Array.from(s.val),
      cand: Array.from(s.cand),
      step: st,
    };
    // 同一技巧保留“最紧凑”的例子（高亮区域与删除数最少，更易看懂）
    if (wanted.includes(key) && (!out[key] || (out[key].mode === mode && score(ex) < score(out[key])))) out[key] = ex;
    s.apply(st);
  }
  if (i % 50 === 0) console.log(i, 'found', Object.keys(out).length, '/', wanted.length, 'missing', wanted.filter((w) => !out[w]).join(','));
}
writeFileSync('src/app/help/examples.json', JSON.stringify(out));
console.log('missing:', wanted.filter((w) => !out[w]).join(',') || '无');

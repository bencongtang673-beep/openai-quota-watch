// 提示：由同一个人类技巧求解器驱动，保证提示讲的就是真实解法。
// 三段式：①标出可推进的区域 ②说出技巧名 ③完整讲解，可一键应用。
import { cellName } from '../engine/geometry';
import { nextStep } from '../engine/human/solver';
import { SolverState, TECH_BY_ID, type CellDigit, type Step } from '../engine/human/state';
import { geometryOf, type GameState } from './game';

export interface Hint {
  kind: 'wrong' | 'step' | 'reveal';
  steps: Step[];
  area: number[];
  techNames: string[];
  text: string;
  placements: CellDigit[];
  eliminations: CellDigit[];
  erase: number[];
  /** 用于第三段在盘面上标记 */
  keys: CellDigit[];
  keys2: CellDigit[];
  links: Step['highlight']['links'];
}

export function computeHint(game: GameState, maxChain = 40): Hint | null {
  const p = game.puzzle;
  const g = geometryOf(p);
  // 1. 先指出填错的格
  const wrong: number[] = [];
  game.values.forEach((v, c) => {
    if (v && !p.givens[c] && v !== p.solution[c]) wrong.push(c);
  });
  if (wrong.length) {
    const c = wrong[0];
    return {
      kind: 'wrong',
      steps: [],
      area: [c],
      techNames: ['检查错误'],
      text: `${cellName(g, c)} 填的 ${game.values[c]} 与答案不符（它会导致后面无解）。建议先把它擦掉。`,
      placements: [],
      eliminations: [],
      erase: [c],
      keys: [],
      keys2: [],
      links: [],
    };
  }
  // 2. 从当前盘面出发，尊重玩家已经做过的正确笔记排除
  const s = SolverState.fromValues(g, game.values, p.cages);
  for (let c = 0; c < s.n; c++) {
    if (s.val[c]) continue;
    const n = game.notes[c];
    if (n && n & (1 << (p.solution[c] - 1))) s.cand[c] &= n;
  }
  const steps: Step[] = [];
  for (let i = 0; i < maxChain; i++) {
    const st = nextStep(s);
    if (!st) break;
    steps.push(st);
    if (st.placements.length) break;
    s.apply(st);
  }
  const last = steps[steps.length - 1];
  if (!last || !last.placements.length) {
    // 理论上不会发生（题目保证可用技巧解出）；兜底：直接揭示一格
    const c = game.values.findIndex((v) => v === 0);
    if (c < 0) return null;
    return {
      kind: 'reveal',
      steps,
      area: [c],
      techNames: ['揭示答案'],
      text: `${cellName(g, c)} = ${p.solution[c]}。`,
      placements: [{ cell: c, digit: p.solution[c] }],
      eliminations: [],
      erase: [],
      keys: [],
      keys2: [],
      links: [],
    };
  }
  const names = [...new Set(steps.map((x) => TECH_BY_ID[x.tech].name))];
  const first = steps[0];
  const text =
    steps.length === 1
      ? last.text
      : steps.map((x, i) => `${i + 1}. 【${TECH_BY_ID[x.tech].name}】${x.text}`).join('\n');
  return {
    kind: 'step',
    steps,
    area: first.highlight.area,
    techNames: names,
    text,
    placements: last.placements,
    eliminations: steps.flatMap((x) => x.eliminations),
    erase: [],
    keys: [...(first.highlight.keys ?? []), ...(steps.length > 1 ? last.placements : [])],
    keys2: first.highlight.keys2 ?? [],
    links: first.highlight.links ?? [],
  };
}

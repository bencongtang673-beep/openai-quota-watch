// 链类技巧：X-Chain、XY-Chain、交替推理链（AIC）。
// 节点 = (格, 数字)；强链：单元内仅两个位置 / 双值格 / （杀手）二格笼的等价关系；
// 弱链：同数字互见 / 同格不同数字 / （杀手）二格笼 A=d ⇒ B=s−d。
import { DIGITS, POP } from '../bits';
import { cn, elimText } from './fmt';
import type { CellDigit, ChainLink, SolverState, Step, TechId } from './state';

type Kind = 'x' | 'xy' | 'aic';

const node = (c: number, d: number) => c * 9 + (d - 1);
const nCell = (x: number) => Math.floor(x / 9);
const nDigit = (x: number) => (x % 9) + 1;

interface Graph {
  strong: Map<number, number[]>;
  weak: (x: number) => number[];
}

function buildGraph(s: SolverState, kind: Kind, digit?: number): Graph {
  const strong = new Map<number, number[]>();
  const addS = (a: number, b: number) => {
    if (!strong.has(a)) strong.set(a, []);
    if (!strong.has(b)) strong.set(b, []);
    if (!strong.get(a)!.includes(b)) strong.get(a)!.push(b);
    if (!strong.get(b)!.includes(a)) strong.get(b)!.push(a);
  };
  if (kind !== 'xy') {
    for (const u of s.g.units) {
      for (let d = 1; d <= 9; d++) {
        if (digit && d !== digit) continue;
        if (s.placedInUnit(u, d)) continue;
        const pos = s.positions(u, d);
        if (pos.length === 2) addS(node(pos[0], d), node(pos[1], d));
      }
    }
  }
  if (kind !== 'x') {
    for (let c = 0; c < s.n; c++) {
      if (!s.val[c] && POP[s.cand[c]] === 2) {
        const [a, b] = DIGITS[s.cand[c]];
        addS(node(c, a), node(c, b));
      }
    }
  }
  // 杀手二格笼：A=d ⇒ B=s−d，即 (A,d) 与 (B,e≠s−d) 弱相连
  const cageWeak = new Map<number, number[]>();
  if (kind === 'aic' && s.cages) {
    for (const cg of s.cages) {
      if (cg.cells.length !== 2) continue;
      const [A, B] = cg.cells;
      if (s.val[A] || s.val[B]) continue;
      for (const [X, Y] of [
        [A, B],
        [B, A],
      ]) {
        for (const d of DIGITS[s.cand[X]]) {
          const partner = cg.sum - d;
          for (const e of DIGITS[s.cand[Y]]) {
            if (e === partner || e === d) continue;
            const k = node(X, d);
            if (!cageWeak.has(k)) cageWeak.set(k, []);
            cageWeak.get(k)!.push(node(Y, e));
          }
        }
      }
    }
  }
  const weak = (x: number): number[] => {
    const c = nCell(x);
    const d = nDigit(x);
    const out: number[] = [];
    const b = 1 << (d - 1);
    if (kind === 'xy') {
      for (const p of s.model.peers[c]) if (!s.val[p] && POP[s.cand[p]] === 2 && s.cand[p] & b) out.push(node(p, d));
      return out;
    }
    for (const p of s.model.peers[c]) if (!s.val[p] && s.cand[p] & b) out.push(node(p, d));
    if (kind === 'aic') {
      for (const e of DIGITS[s.cand[c]]) if (e !== d) out.push(node(c, e));
      const cw = cageWeak.get(x);
      if (cw) out.push(...cw);
    }
    return out;
  };
  return { strong, weak };
}

interface Found {
  chain: number[]; // 节点序列，链接依次为 强、弱、强、…、强
  elims: CellDigit[];
}

const MAX_LINKS: Record<Kind, number> = { x: 13, xy: 15, aic: 15 };

function search(s: SolverState, kind: Kind, g: Graph): Found | null {
  let best: Found | null = null;
  const starts = [...g.strong.keys()].sort((a, b) => a - b);
  for (const start of starts) {
    // BFS：状态 = 节点 * 2 + parity（0 = 经强链到达，可接弱链；1 = 经弱链到达，需接强链）
    const parent = new Map<number, number>();
    const depth = new Map<number, number>();
    const startState = start * 2 + 1; // 起点之后需要接强链
    parent.set(startState, -1);
    depth.set(startState, 0);
    const queue = [startState];
    while (queue.length) {
      const st = queue.shift()!;
      const x = st >> 1;
      const needStrong = (st & 1) === 1;
      const dep = depth.get(st)!;
      if (best && dep + 1 >= best.chain.length - 1) break;
      if (dep >= MAX_LINKS[kind]) break;
      const nexts = needStrong ? g.strong.get(x) ?? [] : g.weak(x);
      for (const y of nexts) {
        const ns = y * 2 + (needStrong ? 0 : 1);
        if (parent.has(ns)) continue;
        parent.set(ns, st);
        depth.set(ns, dep + 1);
        if (needStrong && dep + 1 >= 3 && y !== start) {
          const elims = eliminationsFor(s, kind, start, y);
          if (elims.length) {
            const chain: number[] = [];
            let cur = ns;
            while (cur !== -1) {
              chain.push(cur >> 1);
              cur = parent.get(cur)!;
            }
            chain.reverse();
            if (!best || chain.length < best.chain.length) best = { chain, elims };
            break;
          }
        }
        queue.push(ns);
      }
    }
    if (best && best.chain.length <= 4) break;
  }
  return best;
}

function eliminationsFor(s: SolverState, kind: Kind, a: number, b: number): CellDigit[] {
  const ca = nCell(a);
  const da = nDigit(a);
  const cb = nCell(b);
  const db = nDigit(b);
  const out: CellDigit[] = [];
  if (da === db) {
    if (ca === cb) return out;
    for (const c of s.commonPeers([ca, cb])) if (s.has(c, da)) out.push({ cell: c, digit: da });
    return out;
  }
  if (kind !== 'aic') return out;
  if (ca === cb) {
    for (const d of DIGITS[s.cand[ca]]) if (d !== da && d !== db) out.push({ cell: ca, digit: d });
    return out;
  }
  if (s.sees(ca, cb)) {
    if (s.has(cb, da)) out.push({ cell: cb, digit: da });
    if (s.has(ca, db)) out.push({ cell: ca, digit: db });
  }
  return out;
}

const NAMES: Record<Kind, { id: TechId; name: string }> = {
  x: { id: 'x_chain', name: 'X-Chain' },
  xy: { id: 'xy_chain', name: 'XY-Chain' },
  aic: { id: 'aic', name: '交替推理链（AIC）' },
};

function toStep(s: SolverState, kind: Kind, f: Found): Step {
  const nodes: CellDigit[] = f.chain.map((x) => ({ cell: nCell(x), digit: nDigit(x) }));
  const links: ChainLink[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) links.push({ from: nodes[i], to: nodes[i + 1], strong: i % 2 === 0 });
  const label = (n: CellDigit) => `${cn(s.g, n.cell)}(${n.digit})`;
  let chainText = label(nodes[0]);
  for (let i = 1; i < nodes.length; i++) chainText += (i % 2 === 1 ? ' ═ ' : ' ─ ') + label(nodes[i]);
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const name = NAMES[kind].name;
  const conclusion =
    first.digit === last.digit
      ? `链的两端 ${label(first)} 与 ${label(last)} 至少有一个成立（都是 ${first.digit}），所以同时看到两端的格不能是 ${first.digit}`
      : first.cell === last.cell
        ? `${cn(s.g, first.cell)} 必定是 ${first.digit} 或 ${last.digit}，其他候选可以删去`
        : `${label(first)} 与 ${label(last)} 至少有一个成立，而两格互相能看到`;
  return {
    tech: NAMES[kind].id,
    placements: [],
    eliminations: f.elims,
    highlight: {
      area: [...new Set([...nodes.map((n) => n.cell), ...f.elims.map((e) => e.cell)])],
      keys: nodes.filter((_, i) => i % 2 === 1),
      keys2: nodes.filter((_, i) => i % 2 === 0),
      links,
    },
    text: `${name}：${chainText}（═ 强链：两者至少一个为真；─ 弱链：两者不能同时为真）。从左端开始：若 ${label(
      first,
    )} 不成立，沿链交替推理可得 ${label(last)} 成立。${conclusion}：${elimText(s.g, f.elims)}。`,
  };
}

export function findXChain(s: SolverState): Step | null {
  let best: Found | null = null;
  for (let d = 1; d <= 9; d++) {
    const f = search(s, 'x', buildGraph(s, 'x', d));
    if (f && (!best || f.chain.length < best.chain.length)) best = f;
  }
  return best ? toStep(s, 'x', best) : null;
}

export function findXYChain(s: SolverState): Step | null {
  const f = search(s, 'xy', buildGraph(s, 'xy'));
  return f ? toStep(s, 'xy', f) : null;
}

export function findAIC(s: SolverState): Step | null {
  const f = search(s, 'aic', buildGraph(s, 'aic'));
  return f ? toStep(s, 'aic', f) : null;
}

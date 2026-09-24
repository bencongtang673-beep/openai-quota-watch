import { getGeometry } from '../src/engine/geometry';
import { rate } from '../src/engine/human/solver';
import { buildModel, countSolutions } from '../src/engine/solver';
const g = getGeometry('classic');
const P: Record<string, string> = {
  wiki: '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79',
  inkala: '8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..',
  nugget: '.......39.....1..5..3.5.8....8.9...6.7...2..1..4.......9.8..5..2....6..4..7.....',
  xwing: '1.....569492.561.8.561.924...964.8.1.64.1....218.356.4.4.5...169.5.614.2621.....5',
};
for (const [k, p] of Object.entries(P)) {
  const givens = p.split('').map((c) => (c === '.' ? 0 : +c));
  const sol = countSolutions(buildModel(g), givens).solution!;
  const t = performance.now();
  const r = rate(g, givens, undefined, { solution: sol });
  console.log(k, JSON.stringify({ ...r, ms: Math.round(performance.now() - t) }));
}

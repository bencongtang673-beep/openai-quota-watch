// 独立校验器：只做最朴素的规则检查，不依赖任何求解器代码。
import type { Geometry } from './geometry';
import type { Cage } from './types';

export interface Violation {
  kind: 'unit' | 'cage-dup' | 'cage-sum' | 'empty' | 'range';
  cells: number[];
  message: string;
}

/** 检查完整终盘是否满足全部约束；返回违规列表（空 = 合法）。 */
export function validateSolution(g: Geometry, grid: ArrayLike<number>, cages?: Cage[]): Violation[] {
  const out: Violation[] = [];
  if (grid.length !== g.size) {
    out.push({ kind: 'range', cells: [], message: `长度 ${grid.length} ≠ ${g.size}` });
    return out;
  }
  for (let i = 0; i < g.size; i++) {
    const v = grid[i];
    if (!(v >= 1 && v <= 9 && Math.floor(v) === v)) out.push({ kind: 'range', cells: [i], message: `格 ${i} 值 ${v} 非法` });
  }
  for (const u of g.units) {
    const seen: number[] = [];
    for (const c of u.cells) {
      const v = grid[c];
      if (seen.indexOf(v) >= 0) out.push({ kind: 'unit', cells: u.cells.filter((x) => grid[x] === v), message: `${u.type}${u.index} 重复 ${v}` });
      seen.push(v);
    }
    for (let d = 1; d <= 9; d++) if (seen.indexOf(d) < 0) out.push({ kind: 'unit', cells: u.cells, message: `${u.type}${u.index} 缺 ${d}` });
  }
  if (cages) {
    for (const cg of cages) {
      let s = 0;
      const seen: number[] = [];
      for (const c of cg.cells) {
        s += grid[c];
        if (seen.indexOf(grid[c]) >= 0) out.push({ kind: 'cage-dup', cells: cg.cells, message: `笼内重复 ${grid[c]}` });
        seen.push(grid[c]);
      }
      if (s !== cg.sum) out.push({ kind: 'cage-sum', cells: cg.cells, message: `笼和 ${s} ≠ ${cg.sum}` });
    }
  }
  return out;
}

/** 部分填写盘面的规则冲突（用于“规则冲突提示”查错模式）：返回冲突格集合。 */
export function findConflicts(g: Geometry, grid: ArrayLike<number>, cages?: Cage[]): Set<number> {
  const bad = new Set<number>();
  for (const u of g.units) {
    for (let a = 0; a < 9; a++) {
      const va = grid[u.cells[a]];
      if (!va) continue;
      for (let b = a + 1; b < 9; b++) {
        if (grid[u.cells[b]] === va) {
          bad.add(u.cells[a]);
          bad.add(u.cells[b]);
        }
      }
    }
  }
  if (cages) {
    for (const cg of cages) {
      let s = 0;
      let full = true;
      for (let a = 0; a < cg.cells.length; a++) {
        const va = grid[cg.cells[a]];
        if (!va) {
          full = false;
          continue;
        }
        s += va;
        for (let b = a + 1; b < cg.cells.length; b++) {
          if (grid[cg.cells[b]] === va) {
            bad.add(cg.cells[a]);
            bad.add(cg.cells[b]);
          }
        }
      }
      if ((full && s !== cg.sum) || s > cg.sum) for (const c of cg.cells) if (grid[c]) bad.add(c);
    }
  }
  return bad;
}

/** 检查区域布局：每区 9 格且四连通。 */
export function validateRegions(regions: number[]): string[] {
  const errs: string[] = [];
  if (regions.length !== 81) return ['长度不是 81'];
  for (let r = 0; r < 9; r++) {
    const cells = [];
    for (let i = 0; i < 81; i++) if (regions[i] === r) cells.push(i);
    if (cells.length !== 9) errs.push(`区域 ${r} 有 ${cells.length} 格`);
    if (cells.length && !isConnected(cells)) errs.push(`区域 ${r} 不连通`);
  }
  return errs;
}

export function isConnected(cells: number[], width = 9): boolean {
  if (cells.length === 0) return true;
  const set = new Set(cells);
  const seen = new Set<number>([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const c = stack.pop()!;
    const r = Math.floor(c / width);
    const col = c % width;
    const nb = [];
    if (r > 0) nb.push(c - width);
    if (r < width - 1) nb.push(c + width);
    if (col > 0) nb.push(c - 1);
    if (col < width - 1) nb.push(c + 1);
    for (const x of nb) if (set.has(x) && !seen.has(x)) {
      seen.add(x);
      stack.push(x);
    }
  }
  return seen.size === cells.length;
}

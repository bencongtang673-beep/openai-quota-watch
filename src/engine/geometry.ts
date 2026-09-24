// 盘面几何：把 5 种模式统一成“格子 + 单元（行/列/宫/对角线/区域）”的结构，
// 所有求解器、生成器、技巧都只依赖这个结构。
import type { Mode, Unit, UnitType } from './types';

export interface SubGrid {
  /** 81 个格子（按子盘内行优先） */
  cells: number[];
  originRow: number;
  originCol: number;
}

export interface Geometry {
  mode: Mode;
  /** 格子总数（81 或 369） */
  size: number;
  /** 显示网格尺寸（9 或 21） */
  width: number;
  height: number;
  cellRow: Int16Array;
  cellCol: Int16Array;
  /** 显示坐标 → 格子编号；-1 表示该位置没有格子 */
  cellAt: Int16Array;
  units: Unit[];
  /** 每格所属单元 id */
  cellUnits: number[][];
  /** 与该格同处某单元的所有其他格（去重） */
  peers: number[][];
  grids: SubGrid[];
  /** 每格所属的子盘列表（武士共享宫格子属于两个子盘） */
  cellGrids: number[][];
  /** 9×9 模式下的宫 / 区域编号（武士为各子盘内的宫号，取第一个子盘） */
  boxOf: Int8Array;
  regions?: number[];
}

export const STANDARD_BOXES: number[] = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9);
  const c = i % 9;
  return Math.floor(r / 3) * 3 + Math.floor(c / 3);
});

/** 武士 5 个子盘在 21×21 上的原点：0 左上、1 右上、2 中、3 左下、4 右下 */
export const SAMURAI_ORIGINS: [number, number][] = [
  [0, 0],
  [0, 12],
  [6, 6],
  [12, 0],
  [12, 12],
];

export const SAMURAI_GRID_NAMES = ['左上', '右上', '中', '左下', '右下'];

const cache = new Map<string, Geometry>();

export function getGeometry(mode: Mode, regions?: number[]): Geometry {
  const key = mode === 'jigsaw' ? 'jigsaw:' + (regions ?? []).join('') : mode;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = mode === 'samurai' ? buildSamurai() : build9(mode, regions);
  if (cache.size > 64) cache.clear();
  cache.set(key, g);
  return g;
}

function build9(mode: Mode, regions?: number[]): Geometry {
  if (mode === 'jigsaw' && (!regions || regions.length !== 81)) throw new Error('锯齿模式需要区域布局');
  const size = 81;
  const cellRow = new Int16Array(size);
  const cellCol = new Int16Array(size);
  const cellAt = new Int16Array(81);
  for (let i = 0; i < 81; i++) {
    cellRow[i] = Math.floor(i / 9);
    cellCol[i] = i % 9;
    cellAt[i] = i;
  }
  const units: Unit[] = [];
  const add = (type: UnitType, index: number, cells: number[]) =>
    units.push({ id: units.length, type, cells, grid: 0, index, grids: [0] });
  for (let r = 0; r < 9; r++) add('row', r, range9((c) => r * 9 + c));
  for (let c = 0; c < 9; c++) add('col', c, range9((r) => r * 9 + c));
  const boxes = mode === 'jigsaw' ? regions! : STANDARD_BOXES;
  for (let b = 0; b < 9; b++) {
    const cells: number[] = [];
    for (let i = 0; i < 81; i++) if (boxes[i] === b) cells.push(i);
    add(mode === 'jigsaw' ? 'region' : 'box', b, cells);
  }
  if (mode === 'diagonal') {
    add('diag', 0, range9((i) => i * 9 + i));
    add('diag', 1, range9((i) => i * 9 + (8 - i)));
  }
  const grids: SubGrid[] = [{ cells: range(81), originRow: 0, originCol: 0 }];
  return finish({
    mode,
    size,
    width: 9,
    height: 9,
    cellRow,
    cellCol,
    cellAt,
    units,
    grids,
    cellGrids: Array.from({ length: 81 }, () => [0]),
    boxOf: Int8Array.from(boxes),
    regions: mode === 'jigsaw' ? regions!.slice() : undefined,
  });
}

function buildSamurai(): Geometry {
  const W = 21;
  const cellAt = new Int16Array(W * W).fill(-1);
  const rows: number[] = [];
  const cols: number[] = [];
  for (const [or, oc] of SAMURAI_ORIGINS) {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        const p = (or + r) * W + (oc + c);
        if (cellAt[p] === -1) {
          cellAt[p] = rows.length;
          rows.push(or + r);
          cols.push(oc + c);
        }
      }
  }
  // 重新按显示坐标行优先编号，便于阅读
  const order = rows.map((r, i) => [r * W + cols[i], i]).sort((a, b) => a[0] - b[0]);
  const size = order.length;
  const cellRow = new Int16Array(size);
  const cellCol = new Int16Array(size);
  cellAt.fill(-1);
  order.forEach(([p], idx) => {
    cellAt[p] = idx;
    cellRow[idx] = Math.floor(p / W);
    cellCol[idx] = p % W;
  });
  const at = (r: number, c: number) => cellAt[r * W + c];
  const grids: SubGrid[] = SAMURAI_ORIGINS.map(([or, oc]) => ({
    cells: range(81).map((i) => at(or + Math.floor(i / 9), oc + (i % 9))),
    originRow: or,
    originCol: oc,
  }));
  const units: Unit[] = [];
  const seen = new Map<string, Unit>();
  grids.forEach((g, gi) => {
    const add = (type: UnitType, index: number, cells: number[]) => {
      const key = cells.slice().sort((a, b) => a - b).join(',');
      const prev = seen.get(key);
      if (prev) {
        prev.grids.push(gi);
        return;
      }
      const u: Unit = { id: units.length, type, cells, grid: gi, index, grids: [gi] };
      units.push(u);
      seen.set(key, u);
    };
    for (let r = 0; r < 9; r++) add('row', r, range9((c) => g.cells[r * 9 + c]));
    for (let c = 0; c < 9; c++) add('col', c, range9((r) => g.cells[r * 9 + c]));
    for (let b = 0; b < 9; b++) {
      const cells: number[] = [];
      for (let i = 0; i < 81; i++) if (STANDARD_BOXES[i] === b) cells.push(g.cells[i]);
      add('box', b, cells);
    }
  });
  const cellGrids: number[][] = Array.from({ length: size }, () => []);
  grids.forEach((g, gi) => g.cells.forEach((c) => cellGrids[c].push(gi)));
  const boxOf = new Int8Array(size);
  grids.forEach((g) => g.cells.forEach((c, i) => (boxOf[c] = STANDARD_BOXES[i])));
  return finish({
    mode: 'samurai',
    size,
    width: W,
    height: W,
    cellRow,
    cellCol,
    cellAt,
    units,
    grids,
    cellGrids,
    boxOf,
  });
}

function finish(g: Omit<Geometry, 'cellUnits' | 'peers'>): Geometry {
  const cellUnits: number[][] = Array.from({ length: g.size }, () => []);
  for (const u of g.units) for (const c of u.cells) cellUnits[c].push(u.id);
  const peers: number[][] = [];
  for (let i = 0; i < g.size; i++) {
    const s = new Set<number>();
    for (const uid of cellUnits[i]) for (const c of g.units[uid].cells) if (c !== i) s.add(c);
    peers.push([...s].sort((a, b) => a - b));
  }
  return { ...g, cellUnits, peers };
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
function range9(f: (i: number) => number): number[] {
  return Array.from({ length: 9 }, (_, i) => f(i));
}

/** 格子的人类可读坐标，例如 “R3C5”（武士加子盘前缀）。 */
export function cellName(g: Geometry, cell: number): string {
  if (g.mode !== 'samurai') return `R${g.cellRow[cell] + 1}C${g.cellCol[cell] + 1}`;
  const gi = g.cellGrids[cell][0];
  const o = g.grids[gi];
  return `${SAMURAI_GRID_NAMES[gi]}R${g.cellRow[cell] - o.originRow + 1}C${g.cellCol[cell] - o.originCol + 1}`;
}

export function unitName(g: Geometry, u: Unit): string {
  const prefix = g.mode === 'samurai' ? SAMURAI_GRID_NAMES[u.grid] + '盘' : '';
  switch (u.type) {
    case 'row':
      return `${prefix}第${u.index + 1}行`;
    case 'col':
      return `${prefix}第${u.index + 1}列`;
    case 'box':
      if (g.mode === 'samurai' && u.grids.length > 1)
        return `共享宫（${u.grids.map((x) => SAMURAI_GRID_NAMES[x]).join('/')}）`;
      return `${prefix}第${u.index + 1}宫`;
    case 'region':
      return `第${u.index + 1}区域`;
    case 'diag':
      return u.index === 0 ? '主对角线' : '副对角线';
  }
}

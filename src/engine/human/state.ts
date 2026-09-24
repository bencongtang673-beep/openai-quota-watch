// 人类技巧求解器的状态与公共类型。
import { ALL, POP } from '../bits';
import type { Geometry } from '../geometry';
import { buildModel, type Model } from '../solver';
import type { Cage, Level, Unit } from '../types';

export type TechId =
  | 'full_house'
  | 'hidden_single'
  | 'naked_single'
  | 'cage_unique'
  | 'pointing'
  | 'claiming'
  | 'cage_combo'
  | 'naked_pair'
  | 'hidden_pair'
  | 'naked_triple'
  | 'hidden_triple'
  | 'cage_cross'
  | 'cage_locked'
  | 'rule45'
  | 'naked_quad'
  | 'hidden_quad'
  | 'x_wing'
  | 'swordfish'
  | 'xy_wing'
  | 'xyz_wing'
  | 'skyscraper'
  | 'two_string_kite'
  | 'simple_coloring'
  | 'empty_rectangle'
  | 'rule45_multi'
  | 'jellyfish'
  | 'w_wing'
  | 'x_chain'
  | 'xy_chain'
  | 'aic'
  | 'ur1'
  | 'ur2'
  | 'ur3'
  | 'ur4'
  | 'bug1'
  | 'rule45_union';

export interface TechInfo {
  id: TechId;
  name: string;
  level: Level;
  weight: number;
  killerOnly?: boolean;
}

/** 技巧目录：顺序 = 求解时的尝试顺序（先易后难） */
export const TECHS: TechInfo[] = [
  { id: 'full_house', name: '最后一格', level: 1, weight: 1 },
  { id: 'hidden_single', name: '隐性唯一（摒除）', level: 1, weight: 1.5 },
  { id: 'naked_single', name: '显性唯一（唯余）', level: 1, weight: 2 },
  { id: 'cage_unique', name: '笼的唯一组合', level: 1, weight: 2, killerOnly: true },
  { id: 'cage_combo', name: '笼组合排除', level: 1, weight: 2.5, killerOnly: true },
  { id: 'pointing', name: '区块摒除（宫→行列）', level: 2, weight: 4 },
  { id: 'claiming', name: '区块摒除（行列→宫）', level: 2, weight: 4.5 },
  { id: 'naked_pair', name: '显性数对', level: 3, weight: 6 },
  { id: 'hidden_pair', name: '隐性数对', level: 3, weight: 7 },
  { id: 'naked_triple', name: '显性三数组', level: 3, weight: 8 },
  { id: 'hidden_triple', name: '隐性三数组', level: 3, weight: 9 },
  { id: 'cage_cross', name: '笼组合交叉排除', level: 3, weight: 7, killerOnly: true },
  { id: 'cage_locked', name: '笼内锁定数字', level: 3, weight: 8, killerOnly: true },
  { id: 'rule45', name: '45 法则', level: 3, weight: 8, killerOnly: true },
  { id: 'naked_quad', name: '显性四数组', level: 4, weight: 12 },
  { id: 'hidden_quad', name: '隐性四数组', level: 4, weight: 13 },
  { id: 'x_wing', name: 'X-Wing', level: 4, weight: 12 },
  { id: 'skyscraper', name: '摩天楼', level: 4, weight: 13 },
  { id: 'two_string_kite', name: '双线风筝', level: 4, weight: 13 },
  { id: 'xy_wing', name: 'XY-Wing', level: 4, weight: 14 },
  { id: 'rule45_multi', name: '45 法则（多格）', level: 4, weight: 14, killerOnly: true },
  { id: 'empty_rectangle', name: '空矩形', level: 4, weight: 15 },
  { id: 'swordfish', name: '剑鱼', level: 4, weight: 15 },
  { id: 'xyz_wing', name: 'XYZ-Wing', level: 4, weight: 16 },
  { id: 'simple_coloring', name: '简单染色', level: 4, weight: 16 },
  { id: 'ur1', name: '唯一矩形 1 型', level: 5, weight: 18 },
  { id: 'ur2', name: '唯一矩形 2 型', level: 5, weight: 19 },
  { id: 'ur4', name: '唯一矩形 4 型', level: 5, weight: 20 },
  { id: 'ur3', name: '唯一矩形 3 型', level: 5, weight: 21 },
  { id: 'bug1', name: 'BUG+1', level: 5, weight: 20 },
  { id: 'w_wing', name: 'W-Wing', level: 5, weight: 20 },
  { id: 'jellyfish', name: '水母', level: 5, weight: 22 },
  { id: 'rule45_union', name: '多笼联立 45 法则', level: 5, weight: 24, killerOnly: true },
  { id: 'x_chain', name: 'X-Chain', level: 5, weight: 24 },
  { id: 'xy_chain', name: 'XY-Chain', level: 5, weight: 26 },
  { id: 'aic', name: '交替推理链（AIC）', level: 5, weight: 30 },
];

export const TECH_BY_ID: Record<TechId, TechInfo> = Object.fromEntries(TECHS.map((t) => [t.id, t])) as Record<
  TechId,
  TechInfo
>;

export interface CellDigit {
  cell: number;
  digit: number;
}

export interface ChainLink {
  from: CellDigit;
  to: CellDigit;
  strong: boolean;
}

/** 提示与讲解用的高亮信息 */
export interface StepHighlight {
  /** 第一段提示：可推进的区域（格子集合） */
  area: number[];
  units?: number[];
  cages?: number[];
  /** 关键候选（绿色）：构成推理的候选 */
  keys?: CellDigit[];
  /** 另一种颜色的关键候选（染色 / 链的“关”端） */
  keys2?: CellDigit[];
  links?: ChainLink[];
}

export interface Step {
  tech: TechId;
  placements: CellDigit[];
  eliminations: CellDigit[];
  highlight: StepHighlight;
  /** 完整讲解（中文） */
  text: string;
}

/** 求解状态：已填值 + 候选位掩码（已填格的候选为 0） */
export class SolverState {
  readonly g: Geometry;
  readonly model: Model;
  readonly cages?: Cage[];
  readonly n: number;
  val: Uint8Array;
  cand: Uint16Array;
  /** see[a * n + b] = 1 表示 a、b 互斥（同单元或同笼） */
  readonly see: Uint8Array;
  /** 行 / 列 / 宫(区域) 单元按子盘索引：rows[grid][i] */
  readonly rows: Unit[][];
  readonly cols: Unit[][];
  readonly boxes: Unit[];
  /** 每格在各子盘内的 (行, 列) 坐标 */
  readonly rc: Map<number, [number, number]>[];

  constructor(g: Geometry, cages?: Cage[], model?: Model, see?: Uint8Array) {
    this.g = g;
    this.cages = cages;
    this.model = model ?? buildModel(g, cages);
    this.n = g.size;
    this.val = new Uint8Array(this.n);
    this.cand = new Uint16Array(this.n).fill(ALL);
    this.see = see ?? buildSee(this.model);
    const ng = g.grids.length;
    this.rows = Array.from({ length: ng }, () => new Array(9));
    this.cols = Array.from({ length: ng }, () => new Array(9));
    this.boxes = [];
    for (const u of g.units) {
      for (const gi of u.grids) {
        if (u.type === 'row') this.rows[gi][u.index] = u;
        if (u.type === 'col') this.cols[gi][u.index] = u;
      }
      if (u.type === 'box' || u.type === 'region') this.boxes.push(u);
    }
    this.rc = Array.from({ length: ng }, () => new Map());
    g.grids.forEach((sg, gi) => sg.cells.forEach((c, i) => this.rc[gi].set(c, [Math.floor(i / 9), i % 9])));
  }

  clone(): SolverState {
    const s = new SolverState(this.g, this.cages, this.model, this.see);
    s.val.set(this.val);
    s.cand.set(this.cand);
    return s;
  }

  /** 从给定数（或当前盘面）初始化：候选 = 1..9 去掉互斥格已填值 */
  static fromValues(g: Geometry, values: ArrayLike<number>, cages?: Cage[]): SolverState {
    const s = new SolverState(g, cages);
    for (let i = 0; i < s.n; i++) if (values[i]) s.val[i] = values[i];
    s.recomputeCandidates();
    return s;
  }

  recomputeCandidates() {
    const peers = this.model.peers;
    for (let i = 0; i < this.n; i++) {
      if (this.val[i]) {
        this.cand[i] = 0;
        continue;
      }
      let m = ALL;
      const p = peers[i];
      for (let k = 0; k < p.length; k++) {
        const v = this.val[p[k]];
        if (v) m &= ~(1 << (v - 1));
      }
      this.cand[i] = m;
    }
  }

  sees(a: number, b: number): boolean {
    return this.see[a * this.n + b] === 1;
  }

  place(cell: number, d: number) {
    this.val[cell] = d;
    this.cand[cell] = 0;
    const b = ~(1 << (d - 1));
    const p = this.model.peers[cell];
    for (let k = 0; k < p.length; k++) this.cand[p[k]] &= b;
  }

  eliminate(cell: number, d: number) {
    this.cand[cell] &= ~(1 << (d - 1));
  }

  apply(step: Step) {
    for (const e of step.eliminations) this.eliminate(e.cell, e.digit);
    for (const p of step.placements) this.place(p.cell, p.digit);
  }

  has(cell: number, d: number): boolean {
    return (this.cand[cell] & (1 << (d - 1))) !== 0;
  }

  isSolved(): boolean {
    // 从上次找到的空格处继续扫描（已填格不会再变空），整体为 O(n) 摊还
    for (let i = this.scanFrom; i < this.n; i++) {
      if (!this.val[i]) {
        this.scanFrom = i;
        return false;
      }
    }
    this.scanFrom = this.n;
    return true;
  }
  private scanFrom = 0;

  /** 候选矛盾：空格无候选，或某单元缺某数字且无处可放 */
  isBroken(): boolean {
    for (let i = 0; i < this.n; i++) if (!this.val[i] && this.cand[i] === 0) return true;
    for (const u of this.g.units) {
      let m = 0;
      for (const c of u.cells) m |= this.val[c] ? 1 << (this.val[c] - 1) : this.cand[c];
      if (m !== ALL) return true;
    }
    return false;
  }

  /** 单元内含候选 d 的未填格 */
  positions(u: Unit, d: number): number[] {
    const b = 1 << (d - 1);
    const out: number[] = [];
    for (const c of u.cells) if (!this.val[c] && this.cand[c] & b) out.push(c);
    return out;
  }

  placedInUnit(u: Unit, d: number): boolean {
    for (const c of u.cells) if (this.val[c] === d) return true;
    return false;
  }

  popcount(cell: number): number {
    return POP[this.cand[cell]];
  }

  /** 同时看到所有给定格的未填格（不含这些格本身） */
  commonPeers(cells: number[]): number[] {
    const out: number[] = [];
    const first = this.model.peers[cells[0]];
    outer: for (let k = 0; k < first.length; k++) {
      const c = first[k];
      if (this.val[c]) continue;
      for (let j = 1; j < cells.length; j++) {
        if (c === cells[j] || !this.sees(c, cells[j])) continue outer;
      }
      if (cells.includes(c)) continue;
      out.push(c);
    }
    return out;
  }
}

const seeCache = new WeakMap<Model, Uint8Array>();
function buildSee(model: Model): Uint8Array {
  const hit = seeCache.get(model);
  if (hit) return hit;
  const n = model.g.size;
  const see = new Uint8Array(n * n);
  model.peers.forEach((p, a) => {
    for (let k = 0; k < p.length; k++) see[a * n + p[k]] = 1;
  });
  seeCache.set(model, see);
  return see;
}

export type Finder = (s: SolverState) => Step | null;

// 引擎公共类型

export type Mode = 'classic' | 'diagonal' | 'jigsaw' | 'killer' | 'samurai';
export const MODES: Mode[] = ['classic', 'diagonal', 'jigsaw', 'killer', 'samurai'];

export const MODE_NAMES: Record<Mode, string> = {
  classic: '经典数独',
  diagonal: '对角线数独',
  jigsaw: '锯齿数独',
  killer: '杀手数独',
  samurai: '武士数独',
};

export type Level = 1 | 2 | 3 | 4 | 5;
export const LEVELS: Level[] = [1, 2, 3, 4, 5];
export const LEVEL_NAMES: Record<Level, string> = {
  1: '入门',
  2: '简单',
  3: '中等',
  4: '困难',
  5: '专家',
};

export type UnitType = 'row' | 'col' | 'box' | 'diag' | 'region';

/** “单元”：恰好 9 格、必须包含 1–9 各一次（行、列、宫、对角线、锯齿区域） */
export interface Unit {
  id: number;
  type: UnitType;
  cells: number[];
  /** 所属子盘（武士 0..4；其他模式 0） */
  grid: number;
  /** 在子盘内的序号（第几行 / 列 / 宫），对角线 0=主对角 1=副对角 */
  index: number;
  /** 同一组格子在武士中可能属于两个子盘（共享宫），这里记录所有子盘 */
  grids: number[];
}

export interface Cage {
  cells: number[];
  sum: number;
}

/** 一道题的完整数据（分享码 / 存档里存的就是它） */
export interface PuzzleData {
  mode: Mode;
  /** 锯齿区域布局：81 个区域编号（0..8），其他模式省略 */
  regions?: number[];
  /** 杀手笼 */
  cages?: Cage[];
  /** 给定数，0 表示空格；长度 = 格子数 */
  givens: number[];
  /** 答案 */
  solution: number[];
  level: Level;
  /** 同档内的难度分（技巧权重累加） */
  score: number;
  fingerprint: string;
}

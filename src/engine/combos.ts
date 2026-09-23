// 杀手笼组合表：k 个互不相同的数字(1..9) 之和为 s 的所有组合（位掩码）。
import { POP } from './bits';

/** COMBOS[k][s] = 位掩码列表 */
export const COMBOS: number[][][] = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => [] as number[]));
for (let m = 0; m < 512; m++) {
  let s = 0;
  for (let d = 1; d <= 9; d++) if (m & (1 << (d - 1))) s += d;
  COMBOS[POP[m]][s].push(m);
}

export function combosFor(k: number, s: number): number[] {
  if (k < 0 || k > 9 || s < 0 || s > 45) return [];
  return COMBOS[k][s];
}

/** 在已用数字 used 之外，k 格和为 s 时每格可能出现的数字并集 */
export function allowedDigits(k: number, s: number, used: number): number {
  if (k === 0) return 0;
  let u = 0;
  for (const m of combosFor(k, s)) if ((m & used) === 0) u |= m;
  return u;
}

export function minSum(k: number): number {
  return (k * (k + 1)) / 2;
}
export function maxSum(k: number): number {
  return (k * (19 - k)) / 2;
}

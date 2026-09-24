import { cellName, unitName, type Geometry } from '../geometry';
import type { Unit } from '../types';
import type { CellDigit } from './state';

export const cn = (g: Geometry, c: number) => cellName(g, c);
export const cns = (g: Geometry, cells: number[]) => cells.map((c) => cellName(g, c)).join('、');
export const un = (g: Geometry, u: Unit) => unitName(g, u);
export const ds = (digits: number[]) => digits.join('、');

export function elimText(g: Geometry, elims: CellDigit[]): string {
  const byDigit = new Map<number, number[]>();
  for (const e of elims) {
    if (!byDigit.has(e.digit)) byDigit.set(e.digit, []);
    byDigit.get(e.digit)!.push(e.cell);
  }
  return [...byDigit.entries()].map(([d, cells]) => `${cns(g, cells)} 删去候选 ${d}`).join('；');
}

export function cellsText(g: Geometry, elims: CellDigit[]): string {
  const byCell = new Map<number, number[]>();
  for (const e of elims) {
    if (!byCell.has(e.cell)) byCell.set(e.cell, []);
    byCell.get(e.cell)!.push(e.digit);
  }
  return [...byCell.entries()].map(([c, d]) => `${cn(g, c)} 删去 ${ds(d.sort())}`).join('；');
}

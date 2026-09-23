// 唯一性求解器 B（独立实现，仅用于测试交叉验证）：Knuth 舞蹈链 Algorithm X。
// 精确覆盖列 = 每格恰填一个数 + 每个单元每个数字恰出现一次。
// 杀手笼不属于精确覆盖，在选行时直接检查“笼内不重复 + 剩余和可达”的约束。
// 注意：刻意不复用求解器 A 的任何代码（不依赖 bits/combos/solver 模块）。
import type { Geometry } from './geometry';
import type { Cage } from './types';

export function dlxCount(g: Geometry, givens: ArrayLike<number>, cages?: Cage[], limit = 2): number {
  const n = g.size;
  const unitCount = g.units.length;
  const numCols = n + unitCount * 9;
  // 节点数组：0 = 根，1..numCols = 列头
  const L: number[] = [];
  const R: number[] = [];
  const U: number[] = [];
  const D: number[] = [];
  const C: number[] = [];
  const ROW: number[] = [];
  const size: number[] = new Array(numCols + 1).fill(0);
  for (let i = 0; i <= numCols; i++) {
    L.push(i - 1);
    R.push(i + 1);
    U.push(i);
    D.push(i);
    C.push(i);
    ROW.push(-1);
  }
  L[0] = numCols;
  R[numCols] = 0;

  const rowCell: number[] = [];
  const rowDigit: number[] = [];
  const cellUnitIdx: number[][] = Array.from({ length: n }, () => []);
  g.units.forEach((u, ui) => u.cells.forEach((c) => cellUnitIdx[c].push(ui)));

  const addRow = (cell: number, d: number) => {
    const rowId = rowCell.length;
    rowCell.push(cell);
    rowDigit.push(d);
    const cols = [1 + cell, ...cellUnitIdx[cell].map((ui) => 1 + n + ui * 9 + (d - 1))];
    let first = -1;
    for (const col of cols) {
      const id = L.length;
      C.push(col);
      ROW.push(rowId);
      // 竖向插入到列底
      U.push(U[col]);
      D.push(col);
      D[U[col]] = id;
      U[col] = id;
      size[col]++;
      if (first === -1) {
        first = id;
        L.push(id);
        R.push(id);
      } else {
        L.push(L[first]);
        R.push(first);
        R[L[first]] = id;
        L[first] = id;
      }
    }
  };

  // 给定数与其单元冲突时直接无解
  for (let c = 0; c < n; c++) {
    const d = givens[c];
    if (d) {
      for (const ui of cellUnitIdx[c]) for (const o of g.units[ui].cells) if (o !== c && givens[o] === d) return 0;
      addRow(c, d);
    } else {
      for (let dd = 1; dd <= 9; dd++) addRow(c, dd);
    }
  }

  const cover = (c: number) => {
    R[L[c]] = R[c];
    L[R[c]] = L[c];
    for (let i = D[c]; i !== c; i = D[i]) {
      for (let j = R[i]; j !== i; j = R[j]) {
        D[U[j]] = D[j];
        U[D[j]] = U[j];
        size[C[j]]--;
      }
    }
  };
  const uncover = (c: number) => {
    for (let i = U[c]; i !== c; i = U[i]) {
      for (let j = L[i]; j !== i; j = L[j]) {
        size[C[j]]++;
        D[U[j]] = j;
        U[D[j]] = j;
      }
    }
    R[L[c]] = c;
    L[R[c]] = c;
  };

  // 杀手笼状态
  const cageOf = new Array(n).fill(-1);
  const cageUsed: boolean[][] = [];
  const cageRemain: number[] = [];
  const cageLeft: number[] = [];
  if (cages) {
    cages.forEach((cg, ci) => {
      for (const c of cg.cells) cageOf[c] = ci;
      cageUsed.push(new Array(10).fill(false));
      cageRemain.push(cg.sum);
      cageLeft.push(cg.cells.length);
    });
  }
  const cageOk = (cell: number, d: number): boolean => {
    const ci = cageOf[cell];
    if (ci < 0) return true;
    if (cageUsed[ci][d]) return false;
    const remain = cageRemain[ci] - d;
    const left = cageLeft[ci] - 1;
    if (left === 0) return remain === 0;
    // 剩余 left 个不同的未用数字能否凑出 remain：看最小和、最大和
    let lo = 0;
    let cnt = 0;
    for (let x = 1; x <= 9 && cnt < left; x++) if (!cageUsed[ci][x] && x !== d) {
      lo += x;
      cnt++;
    }
    if (cnt < left) return false;
    let hi = 0;
    cnt = 0;
    for (let x = 9; x >= 1 && cnt < left; x--) if (!cageUsed[ci][x] && x !== d) {
      hi += x;
      cnt++;
    }
    return remain >= lo && remain <= hi;
  };
  const cagePush = (cell: number, d: number) => {
    const ci = cageOf[cell];
    if (ci < 0) return;
    cageUsed[ci][d] = true;
    cageRemain[ci] -= d;
    cageLeft[ci]--;
  };
  const cagePop = (cell: number, d: number) => {
    const ci = cageOf[cell];
    if (ci < 0) return;
    cageUsed[ci][d] = false;
    cageRemain[ci] += d;
    cageLeft[ci]++;
  };

  let found = 0;
  const search = (): void => {
    if (R[0] === 0) {
      found++;
      return;
    }
    let c = R[0];
    let best = size[c];
    for (let j = R[c]; j !== 0; j = R[j]) if (size[j] < best) {
      best = size[j];
      c = j;
    }
    if (best === 0) return;
    cover(c);
    for (let r = D[c]; r !== c && found < limit; r = D[r]) {
      const rowId = ROW[r];
      const cell = rowCell[rowId];
      const d = rowDigit[rowId];
      if (!cageOk(cell, d)) continue;
      cagePush(cell, d);
      for (let j = R[r]; j !== r; j = R[j]) cover(C[j]);
      search();
      for (let j = L[r]; j !== r; j = L[j]) uncover(C[j]);
      cagePop(cell, d);
    }
    uncover(c);
  };
  search();
  return found;
}

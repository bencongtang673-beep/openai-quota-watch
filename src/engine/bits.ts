// 候选数位掩码工具：数字 d(1..9) 对应第 d-1 位。
export const ALL = 0x1ff;

export const POP = new Uint8Array(512);
export const LOWEST_DIGIT = new Uint8Array(512); // 最小的数字 (1..9)，0 表示空
export const DIGITS: number[][] = [];
for (let m = 0; m < 512; m++) {
  let c = 0;
  const ds: number[] = [];
  for (let d = 1; d <= 9; d++) {
    if (m & (1 << (d - 1))) {
      c++;
      ds.push(d);
    }
  }
  POP[m] = c;
  LOWEST_DIGIT[m] = ds.length ? ds[0] : 0;
  DIGITS.push(ds);
}

export const bit = (d: number) => 1 << (d - 1);

export function maskOf(digits: Iterable<number>): number {
  let m = 0;
  for (const d of digits) m |= bit(d);
  return m;
}

export function digitsText(m: number): string {
  return DIGITS[m].join('');
}

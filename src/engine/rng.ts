// xoshiro128** 伪随机数生成器（可设种子）。种子默认来自 crypto.getRandomValues。

export interface Rng {
  /** [0, 2^32) 的无符号整数 */
  nextU32(): number;
  /** [0, 1) 浮点 */
  next(): number;
  /** [0, n) 整数 */
  int(n: number): number;
  /** 原地洗牌 */
  shuffle<T>(arr: T[]): T[];
  /** 当前内部状态（可用于复现） */
  state(): [number, number, number, number];
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** splitmix32：把任意 32 位种子扩展成 4 个状态字，避免全零状态 */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createRng(seed?: number | [number, number, number, number]): Rng {
  let s0: number, s1: number, s2: number, s3: number;
  if (Array.isArray(seed)) {
    [s0, s1, s2, s3] = seed.map((x) => x >>> 0) as [number, number, number, number];
  } else {
    const sm = splitmix32(seed === undefined ? randomSeed() : seed);
    s0 = sm();
    s1 = sm();
    s2 = sm();
    s3 = sm();
  }
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

  const nextU32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  };
  const rng: Rng = {
    nextU32,
    next: () => nextU32() / 4294967296,
    int: (n: number) => {
      if (n <= 0) return 0;
      // 拒绝采样，消除取模偏差
      const limit = Math.floor(4294967296 / n) * n;
      let x = nextU32();
      while (x >= limit) x = nextU32();
      return x % n;
    },
    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
    state: () => [s0, s1, s2, s3],
  };
  return rng;
}

/** 来自 crypto.getRandomValues 的 32 位随机种子（不可用时退化为时间+Math.random） */
export function randomSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
}

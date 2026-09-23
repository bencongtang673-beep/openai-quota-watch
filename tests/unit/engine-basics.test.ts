import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { sha256Hex } from '../../src/engine/sha256';
import { fingerprint, relabelByFirstOccurrence } from '../../src/engine/fingerprint';
import { getGeometry } from '../../src/engine/geometry';
import { rate } from '../../src/engine/human/solver';
import { COMBOS, allowedDigits } from '../../src/engine/combos';
import { DIGITS } from '../../src/engine/bits';
import { buildModel, countSolutions } from '../../src/engine/solver';

const parse = (s: string) => s.split('').map((ch) => (ch === '.' ? 0 : Number(ch)));

describe('PRNG xoshiro128**', () => {
  it('同种子可复现、不同种子不同', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const xa = Array.from({ length: 5 }, () => a.nextU32());
    expect(Array.from({ length: 5 }, () => b.nextU32())).toEqual(xa);
    expect(Array.from({ length: 5 }, () => c.nextU32())).not.toEqual(xa);
  });
  it('与参考实现一致（状态 1,2,3,4 的前几个输出）', () => {
    const r = createRng([1, 2, 3, 4]);
    // 参考：xoshiro128** C 实现，s = {1,2,3,4}
    expect([r.nextU32(), r.nextU32(), r.nextU32()]).toEqual([11520, 0, 5927040]);
  });
  it('int(n) 分布大致均匀', () => {
    const r = createRng(7);
    const counts = new Array(9).fill(0);
    for (let i = 0; i < 90000; i++) counts[r.int(9)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
  });
});

describe('纯 JS SHA-256', () => {
  it('标准测试向量', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    // 多块（>64 字节）输入
    expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
});

describe('指纹去重', () => {
  it('换数字标签的“伪新题”指纹相同（经典）', () => {
    const p = parse('53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79');
    const swapped = p.map((d) => (d === 0 ? 0 : 10 - d));
    expect(relabelByFirstOccurrence(p)).toEqual(relabelByFirstOccurrence(swapped));
    expect(fingerprint({ mode: 'classic', givens: p })).toBe(fingerprint({ mode: 'classic', givens: swapped }));
    expect(fingerprint({ mode: 'classic', givens: p })).not.toBe(fingerprint({ mode: 'diagonal', givens: p }));
  });
  it('杀手不重新编号，笼顺序无关', () => {
    const cages = [
      { cells: [0, 1], sum: 3 },
      { cells: [2, 3], sum: 7 },
    ];
    const g = new Array(81).fill(0);
    const a = fingerprint({ mode: 'killer', givens: g, cages });
    const b = fingerprint({ mode: 'killer', givens: g, cages: [cages[1], cages[0]] });
    const c = fingerprint({ mode: 'killer', givens: g, cages: [{ cells: [0, 1], sum: 4 }, cages[1]] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('杀手组合表', () => {
  it('2 格和 3 只有 {1,2}；3 格和 24 只有 {7,8,9}；9 格和 45 只有全集', () => {
    expect(COMBOS[2][3].map((m) => DIGITS[m])).toEqual([[1, 2]]);
    expect(COMBOS[3][24].map((m) => DIGITS[m])).toEqual([[7, 8, 9]]);
    expect(COMBOS[9][45].length).toBe(1);
    expect(DIGITS[allowedDigits(2, 10, 0)]).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
  });
});

describe('评级器校准（已知难度的经典题）', () => {
  const g = getGeometry('classic');
  it('纯靠单数可解的题判 1 档', () => {
    const r = rate(g, parse('53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'));
    expect(r.solved).toBe(true);
    expect(r.level).toBe(1);
  });
  it('公认超难题判为“超出 5 档”并拒绝，且不会卡死', () => {
    const hard = [
      '8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..', // Arto Inkala 2012
      '..53.....8......2..7..1.5..4....53...1..7...6..32...8..6.5....9..4....3......97..', // 经典高难题（需要试探/高级链）
      '1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..', // AI Escargot
      '1.......2.9.4...5...6...7...5.9.3.......7.......85..4.7.....6...3...9.8...2.....1', // Easter Monster
    ];
    for (const p of hard) {
      expect(countSolutions(buildModel(g), parse(p)).count).toBe(1);
      const t = performance.now();
      const r = rate(g, parse(p));
      expect(performance.now() - t).toBeLessThan(10_000);
      expect(r.solved).toBe(false);
      expect(r.level).toBeNull();
    }
  });
});

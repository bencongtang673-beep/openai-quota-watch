import { describe, expect, it } from 'vitest';
import { generate } from '../../src/engine/generate';
import { autoNotes, eraseCell, isSolvedByRules, newGame, redo, restart, setValue, toggleNote, undo } from '../../src/game/game';
import { computeHint } from '../../src/game/hint';
import { applyHintChanges } from '../../src/game/game';
import { decodeShare, encodeShare, ShareError } from '../../src/app/share';
import { computeStats, fmtTime } from '../../src/app/stats';

const p = generate({ mode: 'classic', level: 3, seed: 4242 })!;
const empties = (g: ReturnType<typeof newGame>) => g.values.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

describe('对局逻辑', () => {
  it('填数自动清除相关笔记；撤销/重做完全还原（含笔记）', () => {
    const g = newGame(p, 'x', 0);
    const [a, b] = empties(g);
    const d = p.solution[a];
    // 在与 a 同行的另一个空格记笔记 d
    const peer = empties(g).find((c) => c !== a && Math.floor(c / 9) === Math.floor(a / 9))!;
    toggleNote(g, peer, d);
    toggleNote(g, b, 1);
    setValue(g, a, d, { autoClearNotes: true });
    expect(g.notes[peer] & (1 << (d - 1))).toBe(0);
    undo(g);
    expect(g.values[a]).toBe(0);
    expect(g.notes[peer] & (1 << (d - 1))).toBeTruthy();
    redo(g);
    expect(g.values[a]).toBe(d);
    eraseCell(g, a);
    expect(g.values[a]).toBe(0);
  });
  it('给定数不可修改；同数再点清除', () => {
    const g = newGame(p, 'x', 0);
    const given = p.givens.findIndex(Boolean);
    expect(setValue(g, given, 1, { autoClearNotes: true })).toBeNull();
    const c = empties(g)[0];
    setValue(g, c, 4, { autoClearNotes: false });
    setValue(g, c, 4, { autoClearNotes: false });
    expect(g.values[c]).toBe(0);
  });
  it('自动填候选计入辅助；重开可撤销', () => {
    const g = newGame(p, 'x', 0);
    autoNotes(g);
    expect(g.assists).toBe(1);
    expect(g.notes.filter(Boolean).length).toBe(empties(g).length);
    setValue(g, empties(g)[0], 3, { autoClearNotes: false });
    restart(g);
    expect(g.notes.every((n) => n === 0)).toBe(true);
    undo(g);
    expect(g.notes.filter(Boolean).length).toBeGreaterThan(0);
  });
  it('反复应用提示一定能按正确答案解完（提示即真实解法）', () => {
    const g = newGame(p, 'x', 0);
    for (let i = 0; i < 200 && !isSolvedByRules(g); i++) {
      const h = computeHint(g)!;
      expect(h.kind).toBe('step');
      for (const pl of h.placements) expect(pl.digit).toBe(p.solution[pl.cell]);
      applyHintChanges(g, h.placements, h.eliminations, h.erase, { autoClearNotes: true });
    }
    expect(isSolvedByRules(g)).toBe(true);
  });
  it('填错后提示先指出错误', () => {
    const g = newGame(p, 'x', 0);
    const c = empties(g)[0];
    setValue(g, c, (p.solution[c] % 9) + 1, { autoClearNotes: false });
    const h = computeHint(g)!;
    expect(h.kind).toBe('wrong');
    expect(h.erase).toEqual([c]);
  });
});

describe('分享码', () => {
  it('编码/解码往返：题面、答案、档位一致', () => {
    const code = encodeShare(p);
    const q = decodeShare('朋友发来：' + code + ' 快来玩');
    expect(q.givens).toEqual(p.givens);
    expect(q.solution).toEqual(p.solution);
    expect(q.level).toBe(p.level);
    expect(q.fingerprint).toBe(p.fingerprint);
  });
  it('拒绝损坏 / 多解 / 版本过新的分享码', () => {
    expect(() => decodeShare('hello')).toThrow(ShareError);
    expect(() => decodeShare('SDK9.abc')).toThrow(/太新/);
    const multi = { ...p, givens: p.givens.map((v, i) => (i < 60 ? 0 : v)) };
    expect(() => decodeShare(encodeShare(multi))).toThrow(/不唯一|无解/);
  });
});

describe('统计', () => {
  it('胜率、最佳/平均用时、连胜', () => {
    const base = { mode: 'classic' as const, level: 1 as const, hints: 0, errors: 0, assists: 0, score: 1, fingerprint: 'f' };
    const h = [
      { ...base, id: 'a', date: 1, timeMs: 300000, result: 'won' as const },
      { ...base, id: 'b', date: 2, timeMs: 200000, result: 'won' as const },
      { ...base, id: 'c', date: 3, timeMs: 0, result: 'abandoned' as const },
      { ...base, id: 'd', date: 4, timeMs: 100000, result: 'won' as const },
    ];
    const s = computeStats(h, 'classic', 1);
    expect(s.played).toBe(4);
    expect(s.winRate).toBe(0.75);
    expect(s.bestMs).toBe(100000);
    expect(s.avgMs).toBe(200000);
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(2);
    expect(fmtTime(3725000)).toBe('1:02:05');
  });
});

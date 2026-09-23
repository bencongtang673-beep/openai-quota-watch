import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DB, DB_NAME, checksum } from '../../src/platform/db';
import { newGame, setValue, toggleNote, undo, type GameState } from '../../src/game/game';
import { generate } from '../../src/engine/generate';

const puzzle = generate({ mode: 'classic', level: 1, seed: 99 })!;

function mkGame(id: string): GameState {
  return newGame(puzzle, id, 1000);
}

function emptyCells(g: GameState) {
  return g.values.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
}

describe('IndexedDB 存档', () => {
  it('每次操作后保存，重开后原样恢复（含撤销/重做历史）', async () => {
    const f = new IDBFactory();
    const db = await DB.open(f);
    const g = mkGame('a');
    const cells = emptyCells(g);
    // 连续快速操作：100 次填数/笔记，每次都立即写入（不等待，模拟快速连点）
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      const c = cells[i % cells.length];
      if (i % 3 === 0) toggleNote(g, c, (i % 9) + 1);
      else setValue(g, c, (i % 9) + 1, { autoClearNotes: true });
      writes.push(db.saveGame(structuredClone(g)));
    }
    undo(g);
    undo(g);
    writes.push(db.saveGame(structuredClone(g)));
    await Promise.all(writes);
    db.close();
    const db2 = await DB.open(f);
    const { games } = await db2.loadGames();
    expect(games.length).toBe(1);
    expect(games[0]).toEqual(g);
    expect(games[0].redo.length).toBe(2);
  });

  it('主存档损坏（半截写入）时回退到上一份有效存档', async () => {
    const f = new IDBFactory();
    const db = await DB.open(f);
    const g = mkGame('b');
    const c = emptyCells(g)[0];
    setValue(g, c, 5, { autoClearNotes: false });
    await db.saveGame(structuredClone(g));
    const good = structuredClone(g);
    setValue(g, emptyCells(g)[0], 6, { autoClearNotes: false });
    await db.saveGame(structuredClone(g));
    db.close();
    // 手工把主存档改成半截数据（模拟存储层损坏）
    await new Promise<void>((resolve, reject) => {
      const open = f.open(DB_NAME);
      open.onsuccess = () => {
        const raw = open.result;
        const tx = raw.transaction('games', 'readwrite');
        const os = tx.objectStore('games');
        const r = os.get('b');
        r.onsuccess = () => {
          const rec = r.result;
          rec.data = rec.data.slice(0, rec.data.length / 2);
          os.put(rec);
        };
        tx.oncomplete = () => {
          raw.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    const db2 = await DB.open(f);
    const { games, recovered } = await db2.loadGames();
    expect(recovered).toEqual(['b']);
    expect(games[0]).toEqual(good);
  });

  it('写入事务中途中止（模拟写入时关页面 / 断电）不会破坏已有存档', async () => {
    const f = new IDBFactory();
    const db = await DB.open(f);
    const g = mkGame('c');
    setValue(g, emptyCells(g)[0], 3, { autoClearNotes: false });
    await db.saveGame(structuredClone(g));
    const snapshot = structuredClone(g);
    db.close();
    await new Promise<void>((resolve) => {
      const open = f.open(DB_NAME);
      open.onsuccess = () => {
        const raw = open.result;
        const tx = raw.transaction(['games', 'games_prev'], 'readwrite');
        tx.objectStore('games_prev').put({ id: 'c', data: 'garbage', sum: 'x', savedAt: 0 });
        tx.objectStore('games').put({ id: 'c', data: '{"half":', sum: 'y', savedAt: 0 });
        tx.abort();
        tx.onabort = () => {
          raw.close();
          resolve();
        };
      };
    });
    const db2 = await DB.open(f);
    const { games } = await db2.loadGames();
    expect(games[0]).toEqual(snapshot);
  });

  it('多个残局并存互不干扰', async () => {
    const f = new IDBFactory();
    const db = await DB.open(f);
    const a = mkGame('g1');
    const b = mkGame('g2');
    setValue(a, emptyCells(a)[0], 1, { autoClearNotes: false });
    setValue(b, emptyCells(b)[1], 2, { autoClearNotes: false });
    await db.saveGame(structuredClone(a));
    await db.saveGame(structuredClone(b));
    setValue(a, emptyCells(a)[0], 4, { autoClearNotes: false });
    await db.saveGame(structuredClone(a));
    const { games } = await db.loadGames();
    const byId = Object.fromEntries(games.map((x) => [x.id, x]));
    expect(byId.g1).toEqual(a);
    expect(byId.g2).toEqual(b);
    await db.finishGame('g1', {
      id: 'g1',
      date: 1,
      mode: 'classic',
      level: 1,
      timeMs: 1,
      hints: 0,
      errors: 0,
      assists: 0,
      score: 1,
      result: 'won',
      fingerprint: 'x',
    });
    const after = await db.loadGames();
    expect(after.games.map((x) => x.id)).toEqual(['g2']);
    expect((await db.listHistory()).length).toBe(1);
  });

  it('旧版本数据结构（v0 预发布格式）迁移到当前版本', async () => {
    const f = new IDBFactory();
    // 用 v0 的格式手工建库
    await new Promise<void>((resolve) => {
      const open = f.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        const d = open.result;
        d.createObjectStore('kv');
        d.createObjectStore('games', { keyPath: 'id' });
        d.createObjectStore('games_prev', { keyPath: 'id' });
        d.createObjectStore('history', { keyPath: 'id' });
        d.createObjectStore('fingerprints', { keyPath: 'fp' });
        d.createObjectStore('pool', { keyPath: 'key' });
      };
      open.onsuccess = () => {
        const d = open.result;
        const tx = d.transaction(['games', 'kv'], 'readwrite');
        const board = puzzle.givens.slice();
        const empty = board.findIndex((v) => v === 0);
        board[empty] = puzzle.solution[empty];
        const pencil: number[][] = board.map(() => []);
        pencil[board.findIndex((v) => v === 0)] = [1, 3, 9];
        // v0：没有包装、没有版本号，笔记是数组，时间是秒
        tx.objectStore('games').put({
          id: 'old',
          puzzle,
          board,
          pencil,
          moves: [{ cell: empty, from: 0, to: puzzle.solution[empty] }],
          seconds: 125,
          hintsUsed: 2,
          mistakes: 1,
          created: 10,
          lastPlayed: 20,
        });
        tx.objectStore('kv').put(0, 'schema');
        tx.oncomplete = () => {
          d.close();
          resolve();
        };
      };
    });
    const db = await DB.open(f);
    expect(await db.getKV('schema')).toBe(1);
    const { games } = await db.loadGames();
    expect(games.length).toBe(1);
    const g = games[0];
    expect(g.v).toBe(1);
    expect(g.elapsedMs).toBe(125000);
    expect(g.hints).toBe(2);
    expect(g.errors).toBe(1);
    const noteCell = g.notes.findIndex((m) => m !== 0);
    expect(g.notes[noteCell]).toBe(0b100000101);
    expect(g.undo.length).toBe(1);
    // 迁移后可继续正常撤销
    undo(g);
    expect(g.values.filter(Boolean).length).toBe(puzzle.givens.filter(Boolean).length);
  });

  it('校验和对任意改动敏感', () => {
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });
});

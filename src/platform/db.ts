// IndexedDB 存储层。
// - 所有数据存 IndexedDB，带“数据结构版本号 + 迁移逻辑”（kv.schema）。
// - 对局存档写入采用单个事务：先把当前有效存档挪到 games_prev，再写入新存档；事务是原子的，
//   断电/杀进程只会让整次写入不生效，不会出现半截数据。每份存档另带校验和，读取时校验失败则回退到上一份。
// - 已发放指纹、历史记录、设置、题池都在这里。
import { sha256Hex } from '../engine/sha256';
import type { Level, Mode, PuzzleData } from '../engine/types';
import { GAME_SCHEMA, type GameState } from '../game/game';

export const DB_NAME = 'sudoku-db';
export const DB_VERSION = 1;
/** 应用数据结构版本（与 IDB 版本分开管理，便于做数据迁移） */
export const DATA_SCHEMA = 1;

export interface HistoryEntry {
  id: string;
  date: number;
  mode: Mode;
  level: Level;
  timeMs: number;
  hints: number;
  errors: number;
  assists: number;
  score: number;
  result: 'won' | 'lost' | 'abandoned';
  fingerprint: string;
}

interface StoredGame {
  id: string;
  data: string;
  sum: string;
  savedAt: number;
}

export interface PoolItem {
  key: string;
  mode: Mode;
  level: Level;
  puzzle: PuzzleData;
  createdAt: number;
}

const STORES = ['kv', 'games', 'games_prev', 'history', 'fingerprints', 'pool'] as const;
type StoreName = (typeof STORES)[number];

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

export function checksum(data: string): string {
  return sha256Hex(data).slice(0, 24);
}

export class DB {
  private constructor(private db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<DB> {
    const open = factory.open(name, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('games_prev')) db.createObjectStore('games_prev', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fingerprints')) db.createObjectStore('fingerprints', { keyPath: 'fp' });
      if (!db.objectStoreNames.contains('pool')) db.createObjectStore('pool', { keyPath: 'key' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('数据库被其他页面占用'));
    });
    // 另一个标签页升级数据库时，本页主动关闭连接，避免阻塞
    db.onversionchange = () => db.close();
    const inst = new DB(db);
    await inst.migrate();
    return inst;
  }

  close() {
    this.db.close();
  }

  private tx(stores: StoreName | StoreName[], mode: IDBTransactionMode = 'readonly') {
    return this.db.transaction(stores, mode);
  }

  // ---------- 迁移 ----------
  async migrate(): Promise<void> {
    const cur = ((await this.getKV<number>('schema')) ?? 0) as number;
    if (cur >= DATA_SCHEMA) return;
    // v0 → v1：预发布草案格式的存档升级（逐条迁移，失败的保留原样不删除）
    if (cur < 1) {
      const tx = this.tx(['games', 'games_prev', 'kv'], 'readwrite');
      for (const store of ['games', 'games_prev'] as const) {
        const os = tx.objectStore(store);
        const all = (await req(os.getAll())) as unknown[];
        for (const raw of all) {
          const migrated = migrateStoredGame(raw);
          if (migrated) os.put(migrated);
        }
      }
      tx.objectStore('kv').put(1, 'schema');
      await done(tx);
    }
  }

  // ---------- kv ----------
  async getKV<T>(key: string): Promise<T | undefined> {
    return (await req(this.tx('kv').objectStore('kv').get(key))) as T | undefined;
  }
  async setKV(key: string, value: unknown): Promise<void> {
    const tx = this.tx('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    await done(tx);
  }

  // ---------- 对局 ----------
  async saveGame(g: GameState): Promise<void> {
    const data = JSON.stringify(g);
    const rec: StoredGame = { id: g.id, data, sum: checksum(data), savedAt: Date.now() };
    const tx = this.tx(['games', 'games_prev'], 'readwrite');
    const games = tx.objectStore('games');
    const prev = tx.objectStore('games_prev');
    const cur = (await req(games.get(g.id))) as StoredGame | undefined;
    if (cur && verify(cur)) prev.put(cur);
    games.put(rec);
    await done(tx);
  }

  /** 读取全部对局；主存档损坏时自动回退到上一份有效存档 */
  async loadGames(): Promise<{ games: GameState[]; recovered: string[] }> {
    const tx = this.tx(['games', 'games_prev']);
    const main = (await req(tx.objectStore('games').getAll())) as StoredGame[];
    const prev = (await req(tx.objectStore('games_prev').getAll())) as StoredGame[];
    const prevById = new Map(prev.map((p) => [p.id, p]));
    const games: GameState[] = [];
    const recovered: string[] = [];
    const ids = new Set([...main.map((m) => m.id), ...prev.map((p) => p.id)]);
    for (const id of ids) {
      const m = main.find((x) => x.id === id);
      const parsed = m && verify(m) ? parse(m) : null;
      if (parsed) {
        games.push(parsed);
        continue;
      }
      const p = prevById.get(id);
      const fallback = p && verify(p) ? parse(p) : null;
      if (fallback) {
        games.push(fallback);
        recovered.push(id);
      }
    }
    return { games, recovered };
  }

  async deleteGame(id: string): Promise<void> {
    const tx = this.tx(['games', 'games_prev'], 'readwrite');
    tx.objectStore('games').delete(id);
    tx.objectStore('games_prev').delete(id);
    await done(tx);
  }

  /** 完成/放弃：删除残局 + 写历史，放在同一事务里，保证不会“两头都没有” */
  async finishGame(id: string, entry: HistoryEntry): Promise<void> {
    const tx = this.tx(['games', 'games_prev', 'history'], 'readwrite');
    tx.objectStore('history').put(entry);
    tx.objectStore('games').delete(id);
    tx.objectStore('games_prev').delete(id);
    await done(tx);
  }

  // ---------- 历史 ----------
  async listHistory(): Promise<HistoryEntry[]> {
    const all = (await req(this.tx('history').objectStore('history').getAll())) as HistoryEntry[];
    return all.sort((a, b) => b.date - a.date);
  }
  async putHistory(entries: HistoryEntry[]): Promise<void> {
    const tx = this.tx('history', 'readwrite');
    for (const e of entries) tx.objectStore('history').put(e);
    await done(tx);
  }

  // ---------- 指纹 ----------
  async addFingerprints(fps: string[]): Promise<void> {
    const tx = this.tx('fingerprints', 'readwrite');
    const os = tx.objectStore('fingerprints');
    const now = Date.now();
    for (const fp of fps) os.put({ fp, at: now });
    await done(tx);
  }
  async listFingerprints(): Promise<string[]> {
    const all = (await req(this.tx('fingerprints').objectStore('fingerprints').getAll())) as { fp: string }[];
    return all.map((x) => x.fp);
  }

  // ---------- 题池（取出即作废） ----------
  async poolPut(item: PoolItem): Promise<void> {
    const tx = this.tx('pool', 'readwrite');
    tx.objectStore('pool').put(item);
    await done(tx);
  }
  async poolList(): Promise<PoolItem[]> {
    return (await req(this.tx('pool').objectStore('pool').getAll())) as PoolItem[];
  }
  /** 取出一道并在同一事务里删除 */
  async poolTake(mode: Mode, level: Level, exclude: Set<string>): Promise<PuzzleData | null> {
    const tx = this.tx('pool', 'readwrite');
    const os = tx.objectStore('pool');
    const all = (await req(os.getAll())) as PoolItem[];
    let picked: PuzzleData | null = null;
    for (const it of all) {
      if (it.mode !== mode || it.level !== level) continue;
      os.delete(it.key);
      if (!exclude.has(it.puzzle.fingerprint)) {
        picked = it.puzzle;
        break;
      }
    }
    await done(tx);
    return picked;
  }

  // ---------- 备份 ----------
  async dumpStore(name: StoreName): Promise<unknown[]> {
    if (name === 'kv') {
      const tx = this.tx('kv');
      const os = tx.objectStore('kv');
      const keys = (await req(os.getAllKeys())) as string[];
      const vals = await req(os.getAll());
      return keys.map((k, i) => ({ key: k, value: vals[i] }));
    }
    return (await req(this.tx(name).objectStore(name).getAll())) as unknown[];
  }
}

function verify(s: StoredGame): boolean {
  try {
    return typeof s.data === 'string' && checksum(s.data) === s.sum;
  } catch {
    return false;
  }
}

function parse(s: StoredGame): GameState | null {
  try {
    const g = JSON.parse(s.data) as GameState;
    if (!g || !g.puzzle || !Array.isArray(g.values)) return null;
    return migrateGameObject(g);
  } catch {
    return null;
  }
}

/** 单条对局对象的迁移（读取时也会调用，保证旧对象升到当前结构） */
export function migrateGameObject(g: GameState & { v?: number }): GameState {
  if ((g.v ?? 0) >= GAME_SCHEMA) return g;
  return upgradeV0(g as unknown as GameV0);
}

// ---------- v0（预发布草案）格式 ----------
interface GameV0 {
  id: string;
  puzzle: PuzzleData;
  board: number[];
  /** v0 的笔记是数字数组 */
  pencil: number[][];
  moves?: { cell: number; from: number; to: number }[];
  seconds: number;
  hintsUsed: number;
  mistakes: number;
  finished?: boolean;
  created: number;
  lastPlayed: number;
}

function upgradeV0(o: GameV0): GameState {
  const notes = (o.pencil ?? []).map((ds) => (ds ?? []).reduce((m, d) => m | (1 << (d - 1)), 0));
  while (notes.length < o.board.length) notes.push(0);
  const undo = (o.moves ?? []).map((mv) => ({
    t: 'set' as const,
    ch: [{ c: mv.cell, pv: mv.from, nv: mv.to, pn: 0, nn: 0 }],
  }));
  return {
    v: GAME_SCHEMA,
    id: o.id,
    puzzle: o.puzzle,
    values: o.board.slice(),
    notes,
    undo,
    redo: [],
    elapsedMs: (o.seconds ?? 0) * 1000,
    hints: o.hintsUsed ?? 0,
    errors: o.mistakes ?? 0,
    assists: 0,
    status: o.finished ? 'won' : 'playing',
    createdAt: o.created ?? Date.now(),
    updatedAt: o.lastPlayed ?? Date.now(),
    grid: o.puzzle.mode === 'samurai' ? 2 : undefined,
  };
}

/** 存储里的原始记录迁移：{id,data,sum} 包装里的 data 若是 v0 对象则升级并重算校验和 */
function migrateStoredGame(raw: unknown): StoredGame | null {
  const r = raw as Partial<StoredGame> & Partial<GameV0>;
  if (typeof r.data === 'string') {
    try {
      const obj = JSON.parse(r.data);
      if ((obj.v ?? 0) >= GAME_SCHEMA) return null;
      const up = upgradeV0(obj as GameV0);
      const data = JSON.stringify(up);
      return { id: up.id, data, sum: checksum(data), savedAt: Date.now() };
    } catch {
      return null;
    }
  }
  // 更早：直接把对象存进去、没有包装
  if (r.board && r.puzzle && r.id) {
    const up = upgradeV0(r as GameV0);
    const data = JSON.stringify(up);
    return { id: up.id, data, sum: checksum(data), savedAt: Date.now() };
  }
  return null;
}

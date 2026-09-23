// 备份：导出 / 导入（JSON 文件或文本码），包含全部残局（含撤销历史）、历史记录、统计（由历史推导）、设置、已玩指纹。
// iPhone 与安卓格式完全相同，可互相导入。导入采用“合并”：绝不删除本机已有数据。
import LZString from 'lz-string';
import { checksum, type HistoryEntry } from '../platform/db';
import { migrateGameObject } from '../platform/db';
import type { GameState } from '../game/game';
import { mergeSettings } from './settings';
import { app, emit } from './store';

export const BACKUP_FORMAT = 'sudoku-backup';
export const BACKUP_VERSION = 1;
const TEXT_PREFIX = 'SDB1.';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  appVersion: string;
  games: { data: string; sum: string }[];
  history: HistoryEntry[];
  fingerprints: string[];
  settings: unknown;
  flags: Record<string, boolean>;
}

export async function buildBackup(): Promise<BackupFile> {
  const db = app.db;
  if (!db) throw new Error('存储不可用');
  const { games } = await db.loadGames();
  // 当前对局可能有尚未写入的计时，这里以内存中的为准
  const cur = app.current;
  const all = games.map((g) => (cur && cur.id === g.id ? cur : g));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    appVersion: __APP_VERSION__,
    games: all.map((g) => {
      const data = JSON.stringify(g);
      return { data, sum: checksum(data) };
    }),
    history: await db.listHistory(),
    fingerprints: await db.listFingerprints(),
    settings: app.settings,
    flags: app.flags,
  };
}

export function backupToText(b: BackupFile): string {
  return TEXT_PREFIX + LZString.compressToEncodedURIComponent(JSON.stringify(b));
}

export function parseBackup(text: string): BackupFile {
  const t = text.trim();
  let obj: unknown;
  if (t.startsWith('{')) {
    obj = JSON.parse(t);
  } else {
    const m = t.match(/SDB(\d+)\.([A-Za-z0-9+\-$]+)/);
    if (!m) throw new Error('不是有效的备份（应为 JSON 文件或以 SDB1. 开头的文本码）');
    if (m[1] !== '1') throw new Error(`备份版本 ${m[1]} 太新，请先更新 App`);
    const json = LZString.decompressFromEncodedURIComponent(m[2]);
    if (!json) throw new Error('备份文本码已损坏或不完整');
    obj = JSON.parse(json);
  }
  const b = obj as BackupFile;
  if (!b || b.format !== BACKUP_FORMAT) throw new Error('不是本 App 的备份文件');
  if (b.version > BACKUP_VERSION) throw new Error('备份来自更新版本的 App，请先更新');
  if (!Array.isArray(b.games) || !Array.isArray(b.history) || !Array.isArray(b.fingerprints)) throw new Error('备份内容不完整');
  return b;
}

export interface ImportReport {
  gamesAdded: number;
  gamesUpdated: number;
  gamesSkipped: number;
  history: number;
  fingerprints: number;
}

/** 合并导入：残局按 id 取最后游玩时间较新的一份；历史与指纹取并集；设置采用备份中的设置 */
export async function importBackup(b: BackupFile): Promise<ImportReport> {
  const db = app.db;
  if (!db) throw new Error('存储不可用');
  const rep: ImportReport = { gamesAdded: 0, gamesUpdated: 0, gamesSkipped: 0, history: 0, fingerprints: 0 };
  const local = new Map(app.games.map((g) => [g.id, g]));
  for (const rec of b.games) {
    if (checksum(rec.data) !== rec.sum) {
      rep.gamesSkipped++;
      continue;
    }
    let g: GameState;
    try {
      g = migrateGameObject(JSON.parse(rec.data));
    } catch {
      rep.gamesSkipped++;
      continue;
    }
    if (g.status !== 'playing') continue;
    if (app.history.some((h) => h.id === g.id)) {
      rep.gamesSkipped++;
      continue;
    }
    const mine = local.get(g.id);
    if (app.current?.id === g.id || (mine && mine.updatedAt >= g.updatedAt)) {
      rep.gamesSkipped++;
      continue;
    }
    if (mine) rep.gamesUpdated++;
    else rep.gamesAdded++;
    local.set(g.id, g);
    await db.saveGame(g);
  }
  const histIds = new Set(app.history.map((h) => h.id));
  const newHist = b.history.filter((h) => h && h.id && !histIds.has(h.id));
  if (newHist.length) await db.putHistory(newHist);
  rep.history = newHist.length;
  const newFps = b.fingerprints.filter((f) => typeof f === 'string' && !app.fingerprints.has(f));
  if (newFps.length) await db.addFingerprints(newFps);
  rep.fingerprints = newFps.length;
  const settings = mergeSettings(b.settings);
  await db.setKV('settings', settings);
  const flags = { ...app.flags, ...(b.flags ?? {}) };
  await db.setKV('flags', flags);
  // 刷新内存
  // 已完成的局从残局中剔除
  for (const h of newHist) local.delete(h.id);
  for (const h of newHist) await db.deleteGame(h.id).catch(() => undefined);
  app.games = [...local.values()].filter((g) => g.status === 'playing').sort((a, b2) => b2.updatedAt - a.updatedAt);
  app.history = await db.listHistory();
  app.fingerprints = new Set(await db.listFingerprints());
  app.settings = settings;
  app.flags = flags;
  emit();
  return rep;
}

export function downloadFile(name: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}


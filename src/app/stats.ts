// 统计：按“模式 × 难度”从历史记录推导（不单独存储，避免数据不一致）。
import type { Level, Mode } from '../engine/types';
import type { HistoryEntry } from '../platform/db';

export interface StatRow {
  mode: Mode;
  level: Level;
  played: number;
  won: number;
  winRate: number;
  bestMs: number | null;
  avgMs: number | null;
  streak: number;
  bestStreak: number;
}

export function computeStats(history: HistoryEntry[], mode: Mode, level: Level): StatRow {
  const rows = history.filter((h) => h.mode === mode && h.level === level).sort((a, b) => a.date - b.date);
  const wins = rows.filter((h) => h.result === 'won');
  let streak = 0;
  let best = 0;
  for (const h of rows) {
    if (h.result === 'won') {
      streak++;
      best = Math.max(best, streak);
    } else streak = 0;
  }
  return {
    mode,
    level,
    played: rows.length,
    won: wins.length,
    winRate: rows.length ? wins.length / rows.length : 0,
    bestMs: wins.length ? Math.min(...wins.map((w) => w.timeMs)) : null,
    avgMs: wins.length ? wins.reduce((s, w) => s + w.timeMs, 0) / wins.length : null,
    streak,
    bestStreak: best,
  };
}

export function fmtTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtDate(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtAgo(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return fmtDate(t).slice(0, 10);
}

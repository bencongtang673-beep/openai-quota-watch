// 设置项与默认值
export type ThemePref = 'system' | 'light' | 'dark';
export type ErrorMode = 'off' | 'conflict' | 'answer';

export interface Settings {
  theme: ThemePref;
  sound: boolean;
  volume: number;
  vibrate: boolean;
  hlUnits: boolean;
  hlSameDigit: boolean;
  hlNotes: boolean;
  errorMode: ErrorMode;
  threeStrikes: boolean;
  autoClearNotes: boolean;
  showTimer: boolean;
  comboHelper: boolean;
  jigsawTint: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  sound: true,
  volume: 0.7,
  vibrate: true,
  hlUnits: true,
  hlSameDigit: true,
  hlNotes: true,
  errorMode: 'conflict',
  threeStrikes: false,
  autoClearNotes: true,
  showTimer: true,
  comboHelper: false,
  jigsawTint: true,
};

export function mergeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === typeof DEFAULT_SETTINGS[k]) (out as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

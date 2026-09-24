// 各模式可达的档位（依据批量抽样校准结果；做不到的档位不显示）。
import type { Level, Mode } from '../engine/types';

const AVAILABLE: Record<Mode, Level[]> = {
  classic: [1, 2, 3, 4, 5],
  diagonal: [1, 2, 3, 4, 5],
  jigsaw: [1, 2, 3, 4, 5],
  killer: [1, 2, 3, 4, 5],
  samurai: [1, 2, 3, 4, 5],
};

export function availableLevels(mode: Mode): Level[] {
  return AVAILABLE[mode];
}

export function modeAvailable(mode: Mode): boolean {
  return AVAILABLE[mode].length > 0;
}

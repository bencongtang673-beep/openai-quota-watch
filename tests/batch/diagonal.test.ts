import { describe, expect, it } from 'vitest';
import { FULL, runBatch } from './verify';
import { writeReport } from './report';
import type { Level } from '../../src/engine/types';

// 完整样本：1–3 档各 200、4 档 50、5 档 20；CI 小样本：各 12/12/12/6/4
const COUNTS: Record<Level, number> = FULL ? { 1: 200, 2: 200, 3: 200, 4: 50, 5: 20 } : { 1: 12, 2: 12, 3: 12, 4: 6, 5: 4 };

describe('对角线数独批量生成验收', () => {
  const rows: ReturnType<typeof runBatch>[] = [];
  for (const level of [1, 2, 3, 4, 5] as Level[]) {
    it(`第 ${level} 档 × ${COUNTS[level]}`, () => {
      const st = runBatch('diagonal', level, COUNTS[level], 62216 + level * 1_000_003);
      rows.push(st);
      expect(st.failures).toBe(0);
    }, 3_600_000);
  }
  it('各档步数与难度分随档位单调上升', () => {
    writeReport('diagonal', rows);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].avgScore).toBeGreaterThan(rows[i - 1].avgScore);
      // 步数在 3/4 档之间差距很小，小样本噪声大：只在完整样本上严格检查
      if (FULL) expect(rows[i].avgSteps).toBeGreaterThan(rows[i - 1].avgSteps);
    }
  });
});

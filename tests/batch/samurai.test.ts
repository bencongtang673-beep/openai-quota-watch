import { describe, expect, it } from 'vitest';
import { FULL, runBatch } from './verify';
import { writeReport } from './report';
import type { Level } from '../../src/engine/types';

// 完整样本：1–3 档各 50、4 档 20、5 档 10；CI 小样本：2/2/2/1/1
const COUNTS: Record<Level, number> = FULL ? { 1: 50, 2: 50, 3: 50, 4: 20, 5: 10 } : { 1: 2, 2: 2, 3: 2, 4: 1, 5: 1 };

describe('武士数独批量生成验收', () => {
  const rows: ReturnType<typeof runBatch>[] = [];
  for (const level of [1, 2, 3, 4, 5] as Level[]) {
    it(`第 ${level} 档 × ${COUNTS[level]}`, () => {
      const st = runBatch('samurai', level, COUNTS[level], 90210 + level * 1_000_003);
      rows.push(st);
      expect(st.failures).toBe(0);
    }, 3_600_000);
  }
  it('各档步数与难度分随档位单调上升', () => {
    writeReport('samurai', rows);
    for (let i = 1; i < rows.length; i++) {
      if (FULL) expect(rows[i].avgScore).toBeGreaterThan(rows[i - 1].avgScore);
      // 步数在 3/4 档之间差距很小，小样本噪声大：只在完整样本上严格检查
      if (FULL) expect(rows[i].avgSteps).toBeGreaterThan(rows[i - 1].avgSteps);
    }
  });
});

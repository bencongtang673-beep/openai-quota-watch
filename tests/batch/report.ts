import { mkdirSync, writeFileSync } from 'node:fs';
import type { BatchStats } from './verify';
import { FULL } from './verify';

export function writeReport(name: string, rows: BatchStats[]) {
  mkdirSync('reports', { recursive: true });
  const lines = [
    `| 档 | 题数 | 生成中位数 ms | 最大 ms | 平均步数 | 平均难度分 | 平均给定数 | 超时 |`,
    `|---|---|---|---|---|---|---|---|`,
    ...rows.map((r) => `| ${r.level} | ${r.count} | ${r.medianMs} | ${r.maxMs} | ${r.avgSteps} | ${r.avgScore} | ${r.avgGivens} | ${r.failures} |`),
  ];
  const text = lines.join('\n');
  console.log(`\n[${name}${FULL ? ' 完整样本' : ' 小样本'}]\n` + text);
  writeFileSync(`reports/batch-${name}${FULL ? '-full' : ''}.md`, text + '\n');
}

import { expect, test } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { openHome } from './helpers';

// 出题性能：正常 CPU 与 4 倍降速（模拟中低端安卓）各测一份，写入 reports/perf.md。
// CPU 降速依赖 Chromium 的 CDP，只在 pixel-chromium 上跑。
const MODES = (process.env.PERF_MODES ?? 'classic').split(',');
const N = Number(process.env.PERF_N ?? 8);

test('出题耗时（正常 / 4 倍降速）', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'pixel-chromium', '仅 Chromium 支持 CPU 降速');
  test.setTimeout(900_000);
  await openHome(page);
  const cdp = await page.context().newCDPSession(page);
  mkdirSync('reports', { recursive: true });
  const lines: string[] = [];
  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    for (const mode of MODES) {
      for (const level of [1, 2, 3, 4, 5]) {
        const times: number[] = await page.evaluate(
          ([m, l, n]) => (window as any).__sudokuBench(m, l, n, 12345),
          [mode, level, N] as const,
        );
        expect(times.every((t) => t >= 0)).toBe(true);
        const s = times.slice().sort((a, b) => a - b);
        lines.push(`| ${rate}× | ${mode} | ${level} | ${N} | ${Math.round(s[s.length >> 1])} | ${Math.round(s[s.length - 1])} |`);
      }
    }
  }
  const text = ['| CPU | 模式 | 档 | 题数 | 中位数 ms | 最大 ms |', '|---|---|---|---|---|---|', ...lines].join('\n');
  console.log(text);
  appendFileSync('reports/perf.md', `\n\n${new Date().toISOString()}\n${text}\n`);
});

import { expect, test } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { openHome } from './helpers';

// 出题性能：正常 CPU 与 4 倍降速（模拟中低端安卓）各测一份，写入 reports/perf.md。
// CPU 降速依赖 Chromium 的 CDP，只在 pixel-chromium 上跑。
const MODES = (process.env.PERF_MODES ?? 'classic').split(',');
const N = Number(process.env.PERF_N ?? 8);

test('出题耗时（正常 / 4 倍降速）', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'pixel-chromium-timing', '仅 Chromium 支持 CPU 降速');
  test.setTimeout(900_000);
  await openHome(page);
  await page.evaluate(() => (window as any).__sudokuStopPool());
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

// 交互流畅度：4 倍降速下，从按下数字键到新数字画到屏幕上的延迟，以及填数动画期间的帧间隔。
test('4 倍降速：填数延迟与动画帧间隔', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'pixel-chromium-timing', '仅 Chromium 支持 CPU 降速');
  test.setTimeout(300_000);
  const { startGame, current, emptyCells, tapCell } = await import('./helpers');
  await openHome(page);
  await page.evaluate(() => (window as any).__sudokuStopPool());
  for (const mode of ['classic', 'killer', 'samurai'] as const) {
    await startGame(page, 1, mode);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const g = await current(page);
    const visible: number[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid=board] rect.cell-surface')).map((r) => Number((r as SVGElement).dataset.cell)),
    );
    const targets = emptyCells(g).filter((c) => visible.includes(c)).slice(0, 12);
    const lat: number[] = [];
    const gaps: number[] = [];
    for (const c of targets) {
      await tapCell(page, c);
      // 在页面内：按下数字键 → 等到该格数字出现在 DOM 且下一帧已绘制，同时记录期间的帧间隔
      const r = await page.evaluate(
        async ({ c, d }) => {
          const key = document.querySelector(`[data-testid=key-${d}]`)!;
          const box = key.getBoundingClientRect();
          const opts = { bubbles: true, clientX: box.x + 5, clientY: box.y + 5, pointerId: 9, pointerType: 'touch', isPrimary: true };
          const t0 = performance.now();
          const frames: number[] = [];
          let last = t0;
          let done = false;
          const loop = (t: number) => {
            frames.push(t - last);
            last = t;
            if (!done) requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
          key.dispatchEvent(new PointerEvent('pointerdown', opts));
          key.dispatchEvent(new PointerEvent('pointerup', opts));
          const shown = () => !!document.querySelector(`[data-testid=board] text.digit.player`) && (window as any).__sudokuApp.current.values[c] === d;
          while (!shown()) await new Promise((res) => requestAnimationFrame(res));
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
          const latency = performance.now() - t0;
          // 继续观察 300ms 动画期间的帧
          await new Promise((res) => setTimeout(res, 300));
          done = true;
          return { latency, frames };
        },
        { c, d: g.solution[c] },
      );
      lat.push(r.latency);
      gaps.push(...r.frames);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    lat.sort((a, b) => a - b);
    gaps.sort((a, b) => a - b);
    const p = (a: number[], q: number) => Math.round(a[Math.min(a.length - 1, Math.floor(a.length * q))]);
    const line = `| ${mode} | ${p(lat, 0.5)} | ${p(lat, 0.9)} | ${p(gaps, 0.5)} | ${p(gaps, 0.95)} |`;
    console.log(line);
    appendFileSync('reports/perf.md', `\n4× 交互（${new Date().toISOString()}）| 模式 | 填数延迟中位数 ms | P90 | 帧间隔中位数 ms | P95 |\n${line}\n`);
    // 验收：4 倍降速下填数到画面 P90 < 150ms；动画帧间隔中位数 ≤ 20ms（约 60fps），P95 < 70ms（无头浏览器帧计时有噪声）
    expect(p(lat, 0.9)).toBeLessThan(150);
    expect(p(gaps, 0.5)).toBeLessThanOrEqual(20);
    expect(p(gaps, 0.95)).toBeLessThan(70);
    await page.getByTestId('game-back').click();
  }
});

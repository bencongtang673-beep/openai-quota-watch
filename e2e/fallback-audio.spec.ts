import { expect, test } from '@playwright/test';
import { openHome } from './helpers';

for (const [mode, level] of [
  ['classic', 4],
  ['samurai', 2],
] as const) {
  test(`Worker 不可用时主线程分片出题（${mode}）：主线程从不被长时间占用`, async ({ page }) => {
    test.slow();
    await openHome(page);
    await page.evaluate(() => (window as any).__sudokuStopPool());
    const r = await page.evaluate(
      async ([m, l]) => {
        // 预热一次（JIT 编译、几何与模型构建是一次性开销），再测稳态
        const w0 = performance.now();
        await (window as any).__sudokuGenMain(m, l);
        const warm = performance.now() - w0;
        // 4ms 心跳：测主线程两次得到执行机会之间的最大间隔
        const gaps: number[] = [];
        let last = performance.now();
        const timer = setInterval(() => {
          const t = performance.now();
          gaps.push(t - last);
          last = t;
        }, 4);
        const t0 = performance.now();
        const p = await (window as any).__sudokuGenMain(m, l);
        const total = performance.now() - t0;
        clearInterval(timer);
        gaps.sort((a, b) => a - b);
        return { ok: !!p && p.level === l, max: gaps[gaps.length - 1], p99: gaps[Math.floor(gaps.length * 0.99)], n: gaps.length, total, warm };
      },
      [mode, level] as const,
    );
    console.log(mode, JSON.stringify(r));
    expect(r.ok).toBe(true);
    expect(r.n).toBeGreaterThan(0);
    // 每片 ≤12ms 后让出；单个不可分割的技巧搜索偶尔更长。要求 P99 < 50ms、最大 < 150ms（界面不会冻结）
    expect(r.p99).toBeLessThan(50);
    expect(r.max).toBeLessThan(150);
  });
}

test('音效：首次触摸创建 AudioContext；快速连点同时发声数不超过上限', async ({ page, browserName }) => {
  await openHome(page);
  // 首次触摸（任意按下）解锁音频
  await page.getByTestId('open-settings').click();
  await page.goBack();
  const st = await page.evaluate(async () => {
    const s = (window as any).__sudokuSound;
    await new Promise((r) => setTimeout(r, 200));
    const names = ['fill', 'note', 'erase', 'undo', 'redo', 'error', 'unit', 'digitDone', 'hint', 'win'];
    for (let i = 0; i < 60; i++) s.play(names[i % names.length], (i % 9) + 1);
    return { state: s.state, voices: s.activeVoices };
  });
  // 无头 WebKit 可能没有音频输出设备，状态可能停留在 suspended；Chromium 应为 running
  if (browserName === 'chromium') expect(st.state).toBe('running');
  expect(st.state).not.toBe('none');
  expect(st.voices).toBeLessThanOrEqual(8);
});

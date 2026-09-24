import { expect, test } from '@playwright/test';
import { current, emptyCells, flush, pressKey, startGame, tapCell } from './helpers';
import { startIsolatedServer } from './server';

// 模拟安卓 APK（Capacitor 原生壳）：根路径加载、window.Capacitor 存在
test('APK 壳内运行：不注册 SW、不显示安装引导、备份只提供文本码；可正常游玩并保存', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'APK 使用安卓 WebView（Chromium 内核）');
  const srv = await startIsolatedServer('dist-apk', '/');
  try {
    await page.addInitScript(() => {
      (window as any).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    });
    await page.goto(srv.url);
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.getByTestId('install-btn')).toHaveCount(0);
    await page.waitForTimeout(800);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    await startGame(page, 1);
    const g = await current(page);
    const c = emptyCells(g)[0];
    await tapCell(page, c);
    await pressKey(page, g.solution[c]);
    await flush(page);
    await page.reload();
    await page.getByTestId('continue-last').click();
    expect((await current(page)).values[c]).toBe(g.solution[c]);
    await page.getByTestId('game-back').click();
    await page.getByTestId('open-backup').click();
    await expect(page.getByTestId('backup-export-file')).toHaveCount(0);
    await expect(page.getByTestId('backup-export-text')).toBeVisible();
  } finally {
    await srv.stop();
  }
});

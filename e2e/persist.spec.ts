import { expect, test } from '@playwright/test';
import { current, emptyCells, flush, openHome, pressKey, startGame, tapCell } from './helpers';
import { startIsolatedServer } from './server';

test.describe('存档健壮性', () => {
  test('连续快速操作后重开，数据完整（含撤销/重做历史）', async ({ page }) => {
    await openHome(page);
    await startGame(page, 1);
    const g0 = await current(page);
    const cells = emptyCells(g0).slice(0, 20);
    for (const c of cells) {
      await tapCell(page, c);
      await pressKey(page, g0.solution[c]);
    }
    await page.getByTestId('tool-undo').click();
    await page.getByTestId('tool-undo').click();
    const before = await current(page);
    await flush(page);
    await page.reload();
    await expect(page.getByTestId('home')).toBeVisible();
    await page.getByTestId('continue-last').click();
    const after = await current(page);
    expect(after.values).toEqual(before.values);
    expect(after.undo).toBe(before.undo);
    expect(after.redo).toBe(2);
    // 撤销历史真的可用
    await page.getByTestId('tool-undo').click();
    expect((await current(page)).values[cells[17]]).toBe(0);
  });

  test('写入过程中关闭页面：重开后恢复到最后一份有效存档，不损坏', async ({ page, context }) => {
    await openHome(page);
    await startGame(page, 1);
    const g0 = await current(page);
    const cells = emptyCells(g0).slice(0, 12);
    for (const c of cells) {
      await tapCell(page, c);
      await pressKey(page, g0.solution[c]);
    }
    // 不等待写入完成，直接关页（模拟杀进程 / 断电）
    await page.close({ runBeforeUnload: false });
    const p2 = await context.newPage();
    await openHome(p2);
    await p2.getByTestId('continue-last').click();
    const g = await current(p2);
    expect(g.id).toBe(g0.id);
    // 恢复的一定是某个完整的前缀状态：已填格都来自操作序列且与 undo 数一致
    const filled = cells.filter((c) => g.values[c] !== 0);
    expect(filled.length).toBe(g.undo);
    expect(cells.slice(0, filled.length)).toEqual(filled);
    for (const c of filled) expect(g.values[c]).toBe(g0.solution[c]);
  });

  test('Service Worker 更新后：下次启动生效、提示“已更新”、存档不丢；对局中不会被强制刷新', async ({ page }) => {
    const srv = await startIsolatedServer('dist');
    try {
      await openHome(page, srv.url);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await expect(page.getByTestId('app-version')).not.toContainText('-next');
      await startGame(page, 1);
      const g0 = await current(page);
      const cells = emptyCells(g0).slice(0, 5);
      for (const c of cells) {
        await tapCell(page, c);
        await pressKey(page, g0.solution[c]);
      }
      await flush(page);
      // 服务器发布新版本
      await srv.switchDir('dist-next');
      // 在对局中检测到新版本：只在后台安装，不刷新
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg!.update();
      });
      await expect
        .poll(async () => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting), { timeout: 20_000 })
        .toBe(true);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForTimeout(800);
      await expect(page.getByTestId('game')).toBeVisible();
      expect((await current(page)).id).toBe(g0.id);
      // “下次启动”：重新打开 App
      await page.reload();
      await expect(page.getByTestId('app-version')).toContainText('-next', { timeout: 15_000 });
      await expect(page.getByTestId('toast').filter({ hasText: '已更新' })).toBeVisible();
      await page.getByTestId('continue-last').click();
      const g = await current(page);
      expect(g.id).toBe(g0.id);
      for (const c of cells) expect(g.values[c]).toBe(g0.solution[c]);
    } finally {
      await srv.stop();
    }
  });
});

test.describe('离线', () => {
  test('首次加载后断网：冷启动、开新局、继续残局都正常', async ({ page, context, browserName }) => {
    const srv = await startIsolatedServer('dist');
    try {
      await openHome(page, srv.url);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await expect(page.getByTestId('home')).toBeVisible();
      // Worker 脚本等资源也在预缓存中：先开一局确保一切就绪
      await startGame(page, 1);
      const g0 = await current(page);
      const c = emptyCells(g0)[0];
      await tapCell(page, c);
      await pressKey(page, g0.solution[c]);
      await flush(page);
      await page.getByTestId('game-back').click();

      // 断网（关掉服务器；Chromium 再叠加 setOffline）
      await srv.stop();
      if (browserName === 'chromium') await context.setOffline(true);
      const p2 = await context.newPage();
      await openHome(p2, srv.url);
      // 继续残局
      await p2.getByTestId('continue-last').click();
      const g = await current(p2);
      expect(g.id).toBe(g0.id);
      expect(g.values[c]).toBe(g0.solution[c]);
      await p2.getByTestId('game-back').click();
      // 离线开新局（本地 Worker 出题）
      await p2.getByTestId('new-game').click();
      await p2.getByTestId('mode-classic').click();
      await p2.getByTestId('level-2').click();
      await expect(p2.getByTestId('game')).toBeVisible({ timeout: 30_000 });
      const g2 = await current(p2);
      expect(g2.id).not.toBe(g0.id);
      expect(g2.level).toBe(2);
      // 看记录
      await p2.goBack();
      await p2.getByTestId('open-history').click();
      await expect(p2.getByTestId('history')).toBeVisible();
    } finally {
      await context.setOffline(false);
      await srv.stop();
    }
  });
});

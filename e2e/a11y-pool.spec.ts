import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openHome, startGame } from './helpers';

test('无障碍扫描（axe，WCAG 2 A/AA）：首页、对局、设置、说明页无严重问题', async ({ page }) => {
  test.slow();
  const scan = async (label: string) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${label}: ${v.id} ${v.help} (${v.nodes.length})`)).toEqual([]);
  };
  await openHome(page);
  await scan('首页');
  await startGame(page, 1);
  await scan('对局');
  await page.getByTestId('settings-btn').click();
  await scan('设置');
  await page.goBack();
  await page.getByTestId('game-back').click();
  await page.getByTestId('open-help').click();
  await scan('说明页');
});

test('题池：前台空闲时预生成，可在设置里看到进度并取消；开局优先取用并作废', async ({ page }) => {
  test.slow();
  await openHome(page);
  // 等待题池至少生成 1 道（启动 4 秒后开始，优先高难档）
  await expect.poll(async () => page.evaluate(() => Object.values((window as any).__sudokuApp.poolCounts).reduce((a: number, b: any) => a + b, 0)), { timeout: 90_000 }).toBeGreaterThan(0);
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('pool-status')).toBeVisible();
  // 运行中可取消
  if (await page.getByTestId('pool-cancel').isVisible()) {
    await page.getByTestId('pool-cancel').click();
    await expect(page.getByTestId('pool-status')).toContainText('已暂停');
  }
  await page.goBack();
  // 从池中取一道：取出后池中该档数量减少
  const slot = await page.evaluate(() => Object.entries((window as any).__sudokuApp.poolCounts).find(([, n]) => (n as number) > 0)![0]);
  const [mode, level] = slot.split('-');
  const before = await page.evaluate((k) => (window as any).__sudokuApp.poolCounts[k], slot);
  const t = Date.now();
  await startGame(page, Number(level), mode);
  expect(Date.now() - t).toBeLessThan(8000);
  const after = await page.evaluate((k) => (window as any).__sudokuApp.poolCounts[k] ?? 0, slot);
  expect(after).toBe(before - 1);
  const fp = await page.evaluate(() => (window as any).__sudokuApp.current.puzzle.fingerprint);
  expect(await page.evaluate((f) => (window as any).__sudokuApp.fingerprints.has(f), fp)).toBe(true);
});

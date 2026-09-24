import { expect, test } from '@playwright/test';
import { current, emptyCells, openHome, pressKey, startGame, tapCell } from './helpers';

for (const mode of ['diagonal', 'jigsaw'] as const) {
  test(`${mode === 'diagonal' ? '对角线' : '锯齿'}数独：开局、首次规则卡、图例、完整通关`, async ({ page }) => {
    test.slow();
    await openHome(page);
    await page.getByTestId('new-game').click();
    await page.getByTestId(`mode-${mode}`).click();
    await page.getByTestId('level-1').click();
    await expect(page.getByTestId('game')).toBeVisible({ timeout: 30_000 });
    // 首次进入该模式自动弹规则卡，含正确 / 违规示例
    await expect(page.getByTestId('rules-card')).toBeVisible();
    await expect(page.getByTestId('rules-card')).toContainText('违规');
    await page.goBack();
    await expect(page.getByTestId('legend')).toBeVisible();
    if (mode === 'diagonal') await expect(page.locator('[data-testid=board] .diag line')).toHaveCount(2);
    const g = await current(page);
    expect(g.mode).toBe(mode);
    for (const c of emptyCells(g)) {
      await tapCell(page, c);
      await pressKey(page, g.solution[c]);
    }
    await expect(page.getByTestId('result')).toContainText('完成');
    // 再次进入同一模式不再自动弹规则卡
    await page.getByTestId('result-done').click();
    await startGame(page, 2, mode);
    await expect(page.getByTestId('rules-card')).toHaveCount(0);
  });
}

test('杀手数独：笼与和数、组合助手（计辅助）、完整通关', async ({ page }) => {
  test.slow();
  await openHome(page);
  await page.getByTestId('new-game').click();
  await page.getByTestId('mode-killer').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('game')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('rules-card')).toContainText('笼');
  await page.goBack();
  const cageCount = await page.evaluate(() => (window as any).__sudokuApp.current.puzzle.cages.length);
  await expect(page.locator('[data-testid=board] .cage-sum')).toHaveCount(cageCount);
  await expect(page.locator('[data-testid=board] path.cage')).toHaveCount(cageCount);
  const g = await current(page);
  const c = emptyCells(g)[0];
  await tapCell(page, c);
  // 选中格所在笼的轮廓加深
  await expect(page.locator('[data-testid=board] path.cage.sel')).toHaveCount(1);
  // 打开组合助手
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-combo').click();
  await expect(page.getByTestId('combo-helper')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => (window as any).__sudokuApp.current.assists)).toBe(1);
  for (const x of emptyCells(g)) {
    await tapCell(page, x);
    await pressKey(page, g.solution[x]);
  }
  await expect(page.getByTestId('result')).toContainText('完成');
  await expect(page.getByTestId('result')).toContainText('辅助');
});

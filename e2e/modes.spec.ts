import { expect, test } from '@playwright/test';
import { current, emptyCells, openHome, pressKey, startGame, tapCell } from './helpers';

for (const mode of ['diagonal', 'jigsaw'] as const) {
  test(`${mode === 'diagonal' ? '对角线' : '锯齿'}数独：开局、首次规则卡、图例、完整通关`, async ({ page }) => {
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

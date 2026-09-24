import { expect, test } from '@playwright/test';
import { current, openHome, pressKey, tapCell } from './helpers';

test('武士数独：子盘放大、缩略图切换与实时进度、共享宫角标、总览缩放（只读）、填数', async ({ page }) => {
  test.slow();
  await openHome(page);
  await page.getByTestId('new-game').click();
  await page.getByTestId('mode-samurai').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('game')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('rules-card')).toContainText('369');
  await page.goBack();
  // 默认放大中间子盘：只画 81 格
  await expect(page.locator('[data-testid=board] rect.cell-surface')).toHaveCount(81);
  await expect(page.getByTestId('thumb-2')).toHaveClass(/sel/);
  // 中盘 4 个角宫都是共享宫，带角标
  await expect(page.locator('[data-testid=board] .shared-badge')).toHaveCount(4);
  // 切到左上子盘
  await page.getByTestId('thumb-0').click();
  await expect(page.getByTestId('thumb-0')).toHaveClass(/sel/);
  await expect(page.locator('[data-testid=board] .shared-badge')).toHaveCount(1);
  // 在左上子盘填一个空格，缩略图进度实时变化
  const g = await current(page);
  const cells: number[] = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-testid=board] rect.cell-surface')).map((r) => Number((r as SVGElement).dataset.cell));
  });
  const target = cells.find((c) => g.values[c] === 0)!;
  const before = await page.getByTestId('thumb-0').getAttribute('aria-label');
  await tapCell(page, target);
  await pressKey(page, g.solution[target]);
  expect((await current(page)).values[target]).toBe(g.solution[target]);
  await expect(page.getByTestId('thumb-0')).not.toHaveAttribute('aria-label', before!);
  // 数字键剩余个数按 41 计（369/9）
  const left = await page.getByTestId('key-1').getAttribute('aria-label');
  expect(Number(left!.match(/剩余 (\d+)/)![1])).toBeLessThanOrEqual(41);
  // 总览：整盘 369 格、可缩放、只读
  await page.getByTestId('overview-btn').click();
  await expect(page.getByTestId('overview')).toBeVisible();
  await expect(page.locator('[data-testid=overview] rect.cell-surface')).toHaveCount(369);
  await page.getByTestId('zoom-in').click();
  await expect(page.getByTestId('overview-inner')).toHaveAttribute('data-scale', '1.40');
  const box = await page.getByTestId('overview-pane').boundingBox();
  // 双指缩放（两根手指同时拉开）
  await page.evaluate(({ x, y }) => {
    const el = document.querySelector('[data-testid=overview-pane]')!;
    const ev = (type: string, id: number, px: number) =>
      el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: px, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
    ev('pointerdown', 1, x - 20);
    ev('pointerdown', 2, x + 20);
    ev('pointermove', 1, x - 60);
    ev('pointermove', 2, x + 60);
    ev('pointerup', 1, x - 60);
    ev('pointerup', 2, x + 60);
  }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
  const scale = Number(await page.getByTestId('overview-inner').getAttribute('data-scale'));
  expect(scale).toBeGreaterThan(2);
  // 返回键关闭总览，回到放大视图
  await page.goBack();
  await expect(page.getByTestId('overview')).toHaveCount(0);
  await expect(page.getByTestId('game')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import {
  conflictingDigit,
  current,
  disableShareApi,
  emptyCells,
  flush,
  longPress,
  openHome,
  pressKey,
  startGame,
  tapCell,
  wrongDigit,
} from './helpers';

test.describe('经典数独：核心操作', () => {
  test('填数、长按记笔记、撤销/重做', async ({ page }) => {
    await openHome(page);
    await startGame(page, 1);
    const g0 = await current(page);
    const cells = emptyCells(g0);
    const c = cells[0];
    await tapCell(page, c);
    await pressKey(page, g0.solution[c]);
    let g = await current(page);
    expect(g.values[c]).toBe(g0.solution[c]);
    // 长按数字键 = 给所选格切换笔记，不改变当前模式
    const c2 = cells[1];
    await tapCell(page, c2);
    await longPress(page, 'key-3');
    g = await current(page);
    expect(g.notes[c2] & (1 << 2)).toBeTruthy();
    // 笔记必须立即画到盘面上（不能等下一次别的操作才刷新）
    await expect(page.locator('[data-testid=board] text.note')).toHaveCount(1);
    await expect(page.getByTestId('tool-note')).toHaveAttribute('aria-pressed', 'false');
    // 笔记模式开关
    await page.getByTestId('tool-note').click();
    await pressKey(page, 7);
    g = await current(page);
    expect(g.notes[c2] & (1 << 6)).toBeTruthy();
    await page.getByTestId('tool-note').click();
    // 撤销两次 → 回到只有第一个填数
    await page.getByTestId('tool-undo').click();
    await page.getByTestId('tool-undo').click();
    g = await current(page);
    expect(g.notes[c2]).toBe(0);
    expect(g.values[c]).toBe(g0.solution[c]);
    expect(g.redo).toBe(2);
    // 重做（更多菜单）
    await page.getByTestId('tool-more').click();
    await page.getByTestId('menu-redo').click();
    await expect(page.getByTestId('menu')).toHaveCount(0);
    await expect.poll(async () => (await current(page)).redo).toBe(1);
    g = await current(page);
    expect(g.notes[c2] & (1 << 2)).toBeTruthy();
    expect(g.redo).toBe(1);
    // 擦除
    await tapCell(page, c);
    await page.getByTestId('tool-erase').click();
    g = await current(page);
    expect(g.values[c]).toBe(0);
  });

  test('三种查错模式', async ({ page }) => {
    await openHome(page);
    await startGame(page, 1);
    const g0 = await current(page);
    const c = emptyCells(g0)[0];
    const bad = conflictingDigit(g0, c);
    // 默认：规则冲突 → 红色 + “!” 标记（不只靠颜色）
    await tapCell(page, c);
    await pressKey(page, bad);
    await expect(page.locator('[data-testid=board] .bad-mark')).not.toHaveCount(0);
    await expect(page.locator('[data-testid=board] text.digit.bad')).not.toHaveCount(0);
    // 切换到“关闭”
    await page.getByTestId('settings-btn').click();
    await page.getByTestId('set-error').locator('[data-value=off]').click();
    await page.goBack();
    await expect(page.locator('[data-testid=board] .bad-mark')).toHaveCount(0);
    // 切到“对照答案”：错误数字标红并画斜线，显示错误次数
    await page.getByTestId('settings-btn').click();
    await page.getByTestId('set-error').locator('[data-value=answer]').click();
    await page.getByTestId('set-3strikes').click();
    await page.goBack();
    await expect(page.locator('[data-testid=board] .wrong-line')).toHaveCount(1);
    await expect(page.getByTestId('errors')).toContainText('错误 1/3');
    // 再错两次 → 失败
    const cells = emptyCells(await current(page));
    for (const x of cells.slice(0, 2)) {
      await tapCell(page, x);
      await pressKey(page, wrongDigit(g0, x));
    }
    await expect(page.getByTestId('result')).toBeVisible();
    await expect(page.getByTestId('result')).toContainText('本局失败');
    await page.getByTestId('result-done').click();
    await expect(page.getByTestId('home')).toBeVisible();
    await page.getByTestId('open-history').click();
    await expect(page.getByTestId('history-item').first()).toContainText('失败');
  });

  test('提示三段式，可一键应用', async ({ page }) => {
    await openHome(page);
    await startGame(page, 2);
    const g0 = await current(page);
    await page.getByTestId('tool-hint').click();
    await expect(page.getByTestId('hint-card')).toContainText('提示 ①');
    await expect(page.locator('[data-testid=board] .hint-area').first()).toBeVisible();
    await page.getByTestId('tool-hint').click();
    await expect(page.getByTestId('hint-tech')).toBeVisible();
    await page.getByTestId('tool-hint').click();
    await expect(page.getByTestId('hint-text')).not.toBeEmpty();
    await page.getByTestId('hint-apply').click();
    const g = await current(page);
    expect(g.hints).toBe(1);
    const placed = g.values.filter(Boolean).length - g0.values.filter(Boolean).length;
    expect(placed).toBe(1);
    // 放下的一定是正确答案
    g.values.forEach((v, i) => {
      if (v) expect(v).toBe(g.solution[i]);
    });
    // 提示操作也能撤销
    await page.getByTestId('tool-undo').click();
    expect((await current(page)).values.filter(Boolean).length).toBe(g0.values.filter(Boolean).length);
  });

  test('暂停遮盖盘面；切到后台自动暂停', async ({ page }) => {
    await openHome(page);
    await startGame(page, 1);
    await page.getByTestId('pause-btn').click();
    await expect(page.getByTestId('pause-cover')).toBeVisible();
    // 暂停时盘面数字被遮住、点格子无效
    await page.getByTestId('resume-btn').click();
    await expect(page.getByTestId('pause-cover')).toHaveCount(0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('pause-cover')).toContainText('已自动暂停');
  });

  test('多个残局并存、残局列表继续、放弃需二次确认', async ({ page }) => {
    await openHome(page);
    await startGame(page, 1);
    const a = await current(page);
    const ca = emptyCells(a)[0];
    await tapCell(page, ca);
    await pressKey(page, a.solution[ca]);
    await page.getByTestId('game-back').click();
    await expect(page.getByTestId('home')).toBeVisible();
    await startGame(page, 2);
    const b = await current(page);
    const cb = emptyCells(b)[3];
    await tapCell(page, cb);
    await pressKey(page, b.solution[cb]);
    await page.getByTestId('game-back').click();
    await page.getByTestId('open-unfinished').click();
    await expect(page.getByTestId('unfinished-item')).toHaveCount(2);
    // 继续第二个（较早的 A）
    await page.getByTestId('unfinished-continue').nth(1).click();
    await expect(page.getByTestId('game')).toBeVisible();
    const a2 = await current(page);
    expect(a2.id).toBe(a.id);
    expect(a2.values[ca]).toBe(a.solution[ca]);
    // 放弃：先取消，再确认
    await page.getByTestId('tool-more').click();
    await page.getByTestId('menu-abandon').click();
    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByTestId('game')).toBeVisible();
    await page.getByTestId('tool-more').click();
    await page.getByTestId('menu-abandon').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('home')).toBeVisible();
    await page.getByTestId('open-unfinished').click();
    await expect(page.getByTestId('unfinished-item')).toHaveCount(1);
  });

  test('通关：全规则校验、成绩卡、历史记录与统计', async ({ page }) => {
    test.slow();
    await openHome(page);
    await startGame(page, 1);
    const g = await current(page);
    for (const c of emptyCells(g)) {
      await tapCell(page, c);
      await pressKey(page, g.solution[c]);
    }
    await expect(page.getByTestId('result')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('result')).toContainText('完成');
    await expect(page.getByTestId('new-record')).toBeVisible();
    await page.getByTestId('result-done').click();
    await page.getByTestId('open-history').click();
    await expect(page.getByTestId('history-item').first()).toContainText('完成');
    await page.goBack();
    await page.getByTestId('open-stats').click();
    await expect(page.getByTestId('stat-classic-1')).toContainText('100%');
  });

  test('安卓返回键：先关最上层，对局返回首页', async ({ page }) => {
    await openHome(page);
    await startGame(page, 1);
    await page.getByTestId('tool-more').click();
    await expect(page.getByTestId('menu')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('menu')).toHaveCount(0);
    await expect(page.getByTestId('game')).toBeVisible();
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('game')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('home')).toBeVisible();
    // 首页打开说明页 → 返回关闭
    await page.getByTestId('open-help').click();
    await expect(page.getByTestId('help')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('help')).toHaveCount(0);
    await expect(page.getByTestId('home')).toBeVisible();
  });
});

test.describe('分享码与备份', () => {
  test('分享码导出 → 导入得到同一道题', async ({ page }) => {
    await disableShareApi(page);
    await openHome(page);
    await startGame(page, 3);
    const g = await current(page);
    await page.getByTestId('tool-more').click();
    await page.getByTestId('menu-share').click();
    const code = await page.getByTestId('share-code').inputValue();
    expect(code).toMatch(/SDK1\./);
    await page.goBack();
    await page.getByTestId('game-back').click();
    await page.getByTestId('open-import').click();
    await page.getByTestId('import-text').fill(code);
    await page.getByTestId('import-go').click();
    await expect(page.getByTestId('game')).toBeVisible({ timeout: 20_000 });
    const g2 = await current(page);
    expect(g2.givens).toEqual(g.givens);
    expect(g2.solution).toEqual(g.solution);
    expect(g2.level).toBe(g.level);
    expect(g2.id).not.toBe(g.id);
  });

  test('损坏的分享码给出明确错误', async ({ page }) => {
    await openHome(page);
    await page.getByTestId('open-import').click();
    await page.getByTestId('import-text').fill('SDK1.abcdef');
    await page.getByTestId('import-go').click();
    await expect(page.getByTestId('import-error')).toBeVisible();
  });

  test('备份导出（文本码）→ 在全新环境导入，残局含撤销历史完整恢复', async ({ page, browser }) => {
    await openHome(page);
    await startGame(page, 1);
    const g = await current(page);
    const cells = emptyCells(g).slice(0, 4);
    for (const c of cells) {
      await tapCell(page, c);
      await pressKey(page, g.solution[c]);
    }
    await flush(page);
    await page.getByTestId('game-back').click();
    await page.getByTestId('open-backup').click();
    await page.getByTestId('backup-export-text').click();
    const code = await page.getByTestId('backup-code').inputValue();
    expect(code.startsWith('SDB1.')).toBeTruthy();

    // 全新的浏览器上下文 = 另一台手机
    const ctx2 = await browser.newContext({ ...test.info().project.use });
    const p2 = await ctx2.newPage();
    await openHome(p2, page.url());
    await p2.getByTestId('open-backup').click();
    await p2.getByTestId('backup-import-text').fill(code);
    await p2.getByTestId('backup-import-go').click();
    await expect(p2.getByTestId('backup-msg')).toContainText('新增残局 1');
    await p2.goBack();
    await p2.getByTestId('continue-last').click();
    const g2 = await current(p2);
    expect(g2.id).toBe(g.id);
    expect(g2.undo).toBe(4);
    for (const c of cells) expect(g2.values[c]).toBe(g.solution[c]);
    await ctx2.close();
  });
});

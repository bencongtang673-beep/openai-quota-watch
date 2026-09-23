import { expect, type Page } from '@playwright/test';

export interface CurrentGame {
  id: string;
  values: number[];
  notes: number[];
  givens: number[];
  solution: number[];
  undo: number;
  redo: number;
  errors: number;
  hints: number;
  mode: string;
  level: number;
}

export async function openHome(page: Page, url = './') {
  await page.goto(url);
  await expect(page.getByTestId('home')).toBeVisible();
}

/** 等待所有 IndexedDB 写入完成 */
export async function flush(page: Page) {
  await page.evaluate(() => (window as unknown as { __sudokuFlush: () => Promise<unknown> }).__sudokuFlush());
}

export async function current(page: Page): Promise<CurrentGame> {
  return page.evaluate(() => {
    const a = (window as unknown as { __sudokuApp: any }).__sudokuApp;
    const g = a.current;
    return {
      id: g.id,
      values: g.values.slice(),
      notes: g.notes.slice(),
      givens: g.puzzle.givens.slice(),
      solution: g.puzzle.solution.slice(),
      undo: g.undo.length,
      redo: g.redo.length,
      errors: g.errors,
      hints: g.hints,
      mode: g.puzzle.mode,
      level: g.puzzle.level,
    };
  });
}

/** 开新局（默认经典·入门）并关闭首次规则卡 */
export async function startGame(page: Page, level = 1, mode = 'classic') {
  await page.getByTestId('new-game').click();
  await page.getByTestId(`mode-${mode}`).click();
  await page.getByTestId(`level-${level}`).click();
  await expect(page.getByTestId('game')).toBeVisible({ timeout: 30_000 });
  // 首次进入该模式会自动弹规则卡
  const card = page.getByTestId('rules-card');
  try {
    await card.waitFor({ state: 'visible', timeout: 2500 });
    await page.goBack();
    await expect(card).toHaveCount(0);
  } catch {
    /* 已看过规则 */
  }
}

export async function tapCell(page: Page, cell: number) {
  await page.locator(`[data-testid=board] rect.cell-surface[data-cell="${cell}"]`).click();
}

export async function pressKey(page: Page, d: number) {
  await page.getByTestId(`key-${d}`).click();
}

export async function longPress(page: Page, testId: string, ms = 650) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

export function emptyCells(g: CurrentGame): number[] {
  return g.values.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
}

/** 找一个与已有数字冲突的错误值（同行已有） */
export function conflictingDigit(g: CurrentGame, cell: number): number {
  const r = Math.floor(cell / 9);
  for (let c = 0; c < 9; c++) {
    const v = g.values[r * 9 + c];
    if (v) return v;
  }
  throw new Error('row empty');
}

/** 一个错误但与现有数字不冲突的值（若存在） */
export function wrongDigit(g: CurrentGame, cell: number): number {
  return (g.solution[cell] % 9) + 1;
}

export async function disableShareApi(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
}

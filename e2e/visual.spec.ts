import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { current, emptyCells, openHome, pressKey, startGame, tapCell } from './helpers';

const PORTRAIT: [number, number][] = [
  [320, 658],
  [360, 800],
  [393, 852],
  [412, 915],
  [440, 956],
];
const LANDSCAPE: [number, number] = [852, 393];

async function prepareGame(page: Page) {
  await openHome(page);
  await startGame(page, 3);
  const g = await current(page);
  const cells = emptyCells(g);
  // 填几格、记几个笔记，让截图有真实内容
  for (const c of cells.slice(0, 4)) {
    await tapCell(page, c);
    await pressKey(page, g.solution[c]);
  }
  await page.getByTestId('tool-note').click();
  for (const c of cells.slice(4, 7)) {
    await tapCell(page, c);
    await pressKey(page, 1);
    await pressKey(page, 5);
    await pressKey(page, 9);
  }
  await page.getByTestId('tool-note').click();
  await tapCell(page, cells[0]);
}

async function assertLayout(page: Page) {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, bt: b.bottom };
    };
    const keys = [...document.querySelectorAll('[data-testid^=key-]')].map((k) => k.getBoundingClientRect());
    const tools = [...document.querySelectorAll('.tool')].map((k) => k.getBoundingClientRect());
    const icons = [...document.querySelectorAll('.topbar .icon-btn')].map((k) => k.getBoundingClientRect());
    return {
      vw,
      vh,
      scrollW: document.documentElement.scrollWidth,
      board: rect('[data-testid=board]'),
      keys: keys.map((b) => ({ w: b.width, h: b.height, r: b.right, x: b.x })),
      tools: tools.map((b) => ({ w: b.width, h: b.height, r: b.right, x: b.x })),
      icons: icons.map((b) => ({ w: b.width, h: b.height, r: b.right, x: b.x })),
    };
  });
  // 无横向溢出
  expect(r.scrollW).toBeLessThanOrEqual(r.vw + 1);
  expect(r.board).not.toBeNull();
  expect(r.board!.x).toBeGreaterThanOrEqual(-1);
  expect(r.board!.r).toBeLessThanOrEqual(r.vw + 1);
  // 触控目标 ≥ 48px，且都在屏幕宽度内
  for (const k of [...r.keys, ...r.tools, ...r.icons]) {
    expect(k.w).toBeGreaterThanOrEqual(47.5);
    expect(k.h).toBeGreaterThanOrEqual(47.5);
    expect(k.x).toBeGreaterThanOrEqual(-1);
    expect(k.r).toBeLessThanOrEqual(r.vw + 1);
  }
  expect(r.keys.length).toBe(9);
}

for (const theme of ['light', 'dark'] as const) {
  test(`各尺寸截图与布局检查（${theme === 'light' ? '浅色' : '深色'}）`, async ({ page }, info) => {
    test.slow();
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 393, height: 852 });
    await prepareGame(page);
    const dir = `docs/screenshots/${info.project.name}`;
    mkdirSync(dir, { recursive: true });
    for (const [w, h] of [...PORTRAIT, LANDSCAPE]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      await assertLayout(page);
      await page.screenshot({ path: `${dir}/game-${w}x${h}-${theme}.png` });
    }
    // 首页
    await page.setViewportSize({ width: 393, height: 852 });
    await page.getByTestId('game-back').click();
    await page.screenshot({ path: `${dir}/home-393x852-${theme}.png` });
  });
}

test('200% 页面缩放（系统 / 浏览器字体放大）下布局不崩', async ({ page }) => {
  // 200% 缩放等价于 CSS 视口宽度减半：393pt 的手机只剩约 196px
  await page.setViewportSize({ width: 393, height: 852 });
  await prepareGame(page);
  for (const [w, h] of [
    [196, 426],
    [160, 329],
  ] as [number, number][]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await assertLayout(page);
    // 所有数字键仍可操作（必要时页面纵向滚动）
    const g = await current(page);
    const c = emptyCells(g)[0];
    await tapCell(page, c);
    await page.getByTestId(`key-${g.solution[c]}`).scrollIntoViewIfNeeded();
    await pressKey(page, g.solution[c]);
    expect((await current(page)).values[c]).toBe(g.solution[c]);
    await page.getByTestId('tool-undo').click();
  }
  // 首页与弹层在极窄宽度下也无横向溢出
  await page.getByTestId('game-back').click();
  for (const id of ['open-settings', 'open-help', 'open-stats']) {
    await page.getByTestId(id).click();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sw).toBeLessThanOrEqual(1);
    await page.goBack();
  }
});

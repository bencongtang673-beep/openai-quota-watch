import { test, expect } from '@playwright/test';
import { E2E_BASE } from '../playwright.config';
import { startIsolatedServer } from './server';

test('子路径 manifest：start_url / scope / id 均指向子路径', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(href).toBe(`${E2E_BASE}manifest.webmanifest`);
  const res = await request.get(href!);
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.start_url).toBe(E2E_BASE);
  expect(m.scope).toBe(E2E_BASE);
  expect(m.display).toBe('standalone');
  for (const icon of m.icons) {
    expect(icon.src.startsWith(E2E_BASE)).toBeTruthy();
    expect((await request.get(icon.src)).ok()).toBeTruthy();
  }
  const touch = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
  expect((await request.get(touch!)).ok()).toBeTruthy();
});

test('Service Worker 在子路径注册，scope 正确，断网后可冷启动', async ({ page, context, browserName }) => {
  const srv = await startIsolatedServer();
  try {
    await page.goto(srv.url);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe(E2E_BASE);
    const swUrl = await page.evaluate(async () => (await navigator.serviceWorker.ready).active!.scriptURL);
    expect(new URL(swUrl).pathname).toBe(`${E2E_BASE}sw.js`);
    await page.reload();
    await expect(page.getByTestId('home')).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    // 缓存名带应用前缀，所有预缓存 URL 都在子路径下
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const urls: string[] = [];
      for (const k of keys) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
      return { keys, urls };
    });
    expect(cached.keys.every((k) => k.startsWith('sudoku-app-'))).toBeTruthy();
    expect(cached.urls.length).toBeGreaterThan(5);
    for (const u of cached.urls) expect(new URL(u).pathname.startsWith(E2E_BASE)).toBeTruthy();

    await srv.stop();
    if (browserName === 'chromium') await context.setOffline(true);
    await page.reload();
    await expect(page.locator('h1')).toHaveText('数独');
    const p2 = await context.newPage();
    await p2.goto(srv.url);
    await expect(p2.locator('h1')).toHaveText('数独');
    await expect(p2.getByTestId('home')).toBeVisible();
  } finally {
    await context.setOffline(false);
    await srv.stop();
  }
});

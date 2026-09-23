import { defineConfig, devices } from '@playwright/test';

// E2E 在子路径 /<仓库名>/ 下运行，与 GitHub Pages 线上环境一致。
export const E2E_BASE = process.env.E2E_BASE ?? '/openai-quota-watch/';
const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}${E2E_BASE}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 15 Pro Max'], browserName: 'webkit' } },
    { name: 'pixel-chromium', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'galaxy-chromium', use: { ...devices['Galaxy S24'], browserName: 'chromium' } },
  ],
  webServer: {
    command: `node scripts/serve.mjs --dir dist --base ${E2E_BASE} --port ${PORT}`,
    url: `http://localhost:${PORT}${E2E_BASE}`,
    reuseExistingServer: !process.env.CI,
  },
});

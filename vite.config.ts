import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { pwaPlugin } from './scripts/pwa-plugin.ts';

// 站点部署在 https://<用户名>.github.io/<仓库名>/ 子路径下，由 BASE_PATH 注入。
// 本地开发默认 "/"；CI 与 E2E 构建时传入 "/<仓库名>/"。
function normalizeBase(raw: string | undefined): string {
  if (!raw || raw === '/') return '/';
  let b = raw.trim();
  if (!b.startsWith('/')) b = '/' + b;
  if (!b.endsWith('/')) b = b + '/';
  return b;
}

const base = normalizeBase(process.env.BASE_PATH);

export default defineConfig({
  base,
  plugins: [preact(), pwaPlugin({ base })],
  build: {
    target: ['es2020', 'safari15', 'chrome90'],
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  worker: {
    format: 'es',
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // E2E 用于模拟“发布新版本”：同一代码加不同标签构建出两个版本
    __BUILD_TAG__: JSON.stringify(process.env.BUILD_TAG ?? ''),
  },
});

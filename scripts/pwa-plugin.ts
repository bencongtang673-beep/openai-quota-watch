import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * 自写的 PWA 插件：
 * 1. 生成 manifest.webmanifest（start_url / scope / id 均指向子路径 base）；
 * 2. 构建结束后扫描产物，生成带预缓存清单与版本号的 sw.js。
 *    版本号 = 全部产物内容的哈希，任何资源变化都会产生新的缓存名。
 */
export function pwaPlugin(opts: { base: string }): Plugin {
  const { base } = opts;
  let outDir = 'dist';
  return {
    name: 'sudoku-pwa',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(buildManifest(base), null, 2),
      });
    },
    writeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && f !== 'version.json');
      files.sort();
      const hash = createHash('sha256');
      for (const f of files) {
        hash.update(f);
        hash.update(readFileSync(join(outDir, f)));
      }
      const version = hash.digest('hex').slice(0, 12);
      const tpl = readFileSync(new URL('../src/sw-template.js', import.meta.url), 'utf8');
      // index.html 以 "./" 形式缓存，导航请求统一回落到它
      const precache = ['./', ...files.filter((f) => f !== 'index.html'), 'index.html'];
      const sw = tpl
        .replace('__SW_VERSION__', version)
        .replace('__PRECACHE_LIST__', JSON.stringify(precache));
      writeFileSync(join(outDir, 'sw.js'), sw);
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version, base, files: precache.length }));
    },
  };
}

export function buildManifest(base: string) {
  return {
    id: base,
    name: '数独 · 五模式',
    short_name: '数独',
    description: '离线数独：经典、对角线、锯齿、杀手、武士，五档难度，本地实时出题。',
    lang: 'zh-CN',
    dir: 'ltr',
    start_url: base,
    scope: base,
    display: 'standalone',
    orientation: 'any',
    background_color: '#F5F0E6',
    theme_color: '#F5F0E6',
    categories: ['games', 'puzzle'],
    icons: [
      { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

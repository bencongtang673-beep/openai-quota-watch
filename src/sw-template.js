/* 数独 PWA Service Worker（构建时由 scripts/pwa-plugin.ts 注入版本号与预缓存清单）
 * 策略：
 *  - install：把全部资源下载进新版本缓存；不自动 skipWaiting —— 新版本在后台就绪，下次启动时由页面决定何时切换。
 *  - activate：删除旧版本缓存（只删本应用前缀的 Cache Storage，绝不触碰 IndexedDB 存档）。
 *  - fetch：同源 GET 走缓存优先；导航请求回落到缓存的 index.html，保证飞行模式冷启动。
 * 所有路径都相对于 SW 的 scope（即站点子路径）计算。
 */
const VERSION = '__SW_VERSION__';
const PREFIX = 'sudoku-app-';
const CACHE = PREFIX + VERSION;
const PRECACHE = __PRECACHE_LIST__;
const SCOPE = self.registration.scope; // 例如 https://x.github.io/repo/

function abs(path) {
  return new URL(path, SCOPE).href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 逐个抓取并校验状态，任何一个失败都让安装失败（旧版本继续工作）
      await Promise.all(
        PRECACHE.map(async (p) => {
          const url = abs(p);
          const res = await fetch(url, { cache: 'reload' });
          if (!res.ok) throw new Error('precache failed: ' + url + ' ' + res.status);
          await cache.put(url, res);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION' && event.source) event.source.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(SCOPE)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = (await cache.match(abs('index.html'))) || (await cache.match(abs('./')));
        if (hit) return hit;
        return fetch(req);
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      return res;
    })(),
  );
});

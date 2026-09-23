// 极简静态服务器：把构建产物挂在子路径下（模拟 GitHub Pages 的 https://<用户>.github.io/<仓库>/）。
// 用法：node scripts/serve.mjs --dir dist --base /openai-quota-watch/ --port 4173
// 测试专用接口：GET /__switch?dir=<目录> 切换所服务的目录（用于模拟发布新版本 / SW 更新）。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
let dir = resolve(args.dir || 'dist');
const base = args.base || '/openai-quota-watch/';
const port = Number(args.port || 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  if (url.pathname === '/__switch') {
    dir = resolve(url.searchParams.get('dir') || dir);
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok ' + dir);
    return;
  }
  if (url.pathname === base.slice(0, -1)) {
    res.writeHead(301, { location: base });
    res.end();
    return;
  }
  if (!url.pathname.startsWith(base)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found (outside base)');
    return;
  }
  let rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(dir, rel));
  if (!file.startsWith(dir)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not file');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, () => {
  console.log(`serving ${dir} at http://localhost:${port}${base}`);
});

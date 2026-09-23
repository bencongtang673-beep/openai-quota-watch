import { spawn, type ChildProcess } from 'node:child_process';
import { E2E_BASE } from '../playwright.config';

let seq = 0;

/**
 * 为单个测试启动独立的静态服务器，可随时关闭以模拟“断网 / 飞行模式”。
 * （WebKit 的 context.setOffline 会连 Service Worker 的响应一起拦截，与真机行为不符，
 *   所以离线测试统一用“关掉服务器”的方式；Chromium 额外再叠加 setOffline。）
 */
export async function startIsolatedServer(dir = 'dist'): Promise<{
  url: string;
  port: number;
  stop: () => Promise<void>;
  switchDir: (d: string) => Promise<void>;
}> {
  const port = 4300 + ((process.pid * 7 + seq++ * 13 + Math.floor(Math.random() * 400)) % 4000);
  const proc: ChildProcess = spawn(
    'node',
    ['scripts/serve.mjs', '--dir', dir, '--base', E2E_BASE, '--port', String(port)],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 10_000);
    proc.stdout!.on('data', (d) => {
      if (String(d).includes('serving')) {
        clearTimeout(t);
        resolve();
      }
    });
    proc.once('exit', () => reject(new Error('server exited early')));
  });
  const url = `http://localhost:${port}${E2E_BASE}`;
  return {
    url,
    port,
    stop: async () => {
      if (proc.exitCode === null && !proc.killed) {
        const exited = new Promise((r) => proc.once('exit', r));
        proc.kill();
        await exited;
      }
    },
    switchDir: async (d: string) => {
      await fetch(`http://localhost:${port}/__switch?dir=${encodeURIComponent(d)}`);
    },
  };
}

// 出题客户端：优先用 Web Worker；不可用时退化为主线程分片执行（每片 ≤ 12ms 就让出），界面永不卡顿。
import { generateIter, type GenProgress, type GenRequest } from '../engine/generate';
import type { PuzzleData } from '../engine/types';
import { features } from './env';

export interface GenHandle {
  promise: Promise<PuzzleData | null>;
  cancel: () => void;
}

let seq = 0;

export function requestPuzzle(req: GenRequest, onProgress?: (p: GenProgress) => void, forceMainThread = false): GenHandle {
  if (features.worker && !forceMainThread) {
    try {
      return viaWorker(req, onProgress);
    } catch {
      /* 某些 WebView 禁用 module worker，退化到主线程 */
    }
  }
  return viaMainThread(req, onProgress);
}

function viaWorker(req: GenRequest, onProgress?: (p: GenProgress) => void): GenHandle {
  const worker = new Worker(new URL('../engine/gen.worker.ts', import.meta.url), { type: 'module' });
  const id = ++seq;
  let settle: (v: PuzzleData | null) => void = () => {};
  let fail: (e: unknown) => void = () => {};
  const promise = new Promise<PuzzleData | null>((res, rej) => {
    settle = res;
    fail = rej;
  });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.id !== id) return;
    if (m.type === 'progress') onProgress?.(m.progress);
    else if (m.type === 'done') {
      settle(m.puzzle);
      worker.terminate();
    } else if (m.type === 'error') {
      fail(new Error(m.message));
      worker.terminate();
    }
  };
  worker.onerror = (e) => {
    fail(new Error(e.message || 'worker error'));
    worker.terminate();
  };
  worker.postMessage({ id, req: { ...req, exclude: req.exclude ? [...req.exclude] : undefined } });
  return {
    promise,
    cancel: () => {
      worker.terminate();
      settle(null);
    },
  };
}

function viaMainThread(req: GenRequest, onProgress?: (p: GenProgress) => void): GenHandle {
  const it = generateIter({ ...req, fineSlices: true });
  let cancelled = false;
  let settle: (v: PuzzleData | null) => void = () => {};
  let fail: (e: unknown) => void = () => {};
  const promise = new Promise<PuzzleData | null>((res, rej) => {
    settle = res;
    fail = rej;
  });
  const slice = () => {
    if (cancelled) return;
    const t0 = performance.now();
    try {
      while (performance.now() - t0 < 12) {
        const r = it.next();
        if (r.done) {
          settle(r.value);
          return;
        }
        onProgress?.(r.value);
      }
    } catch (e) {
      fail(e);
      return;
    }
    setTimeout(slice, 0);
  };
  setTimeout(slice, 0);
  return {
    promise,
    cancel: () => {
      cancelled = true;
      settle(null);
    },
  };
}

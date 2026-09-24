// 出题 Web Worker：收到请求后在后台线程完整跑完生成器，定期回报进度。取消 = 主线程直接 terminate。
import { generateIter, type GenRequest } from './generate';

interface Msg {
  id: number;
  req: Omit<GenRequest, 'exclude'> & { exclude?: string[] };
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const { id, req } = e.data;
  const it = generateIter({ ...req, exclude: new Set(req.exclude ?? []) });
  let last = 0;
  try {
    for (;;) {
      const r = it.next();
      if (r.done) {
        (self as unknown as Worker).postMessage({ id, type: 'done', puzzle: r.value });
        return;
      }
      const t = performance.now();
      if (t - last > 100) {
        last = t;
        (self as unknown as Worker).postMessage({ id, type: 'progress', progress: r.value });
      }
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, type: 'error', message: String(err) });
  }
};

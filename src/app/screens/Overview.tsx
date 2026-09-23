// 武士数独总览：整盘显示，可双指缩放、平移，只用于查看（不能填数）。
import { useRef, useState } from 'preact/hooks';
import { getGeometry } from '../../engine/geometry';
import { Board } from '../components/Board';
import { FullPage } from '../components/ui';
import { useApp } from '../store';

export function OverviewLayer() {
  const a = useApp();
  const g = a.current;
  const [tf, setTf] = useState({ s: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ s: number; x: number; y: number; d: number; cx: number; cy: number } | null>(null);
  if (!g) return null;
  const geo = getGeometry('samurai');
  const onDown = (e: PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start.current = snapshot();
  };
  const snapshot = () => {
    const p = [...pts.current.values()];
    const cx = p.reduce((s, q) => s + q.x, 0) / p.length;
    const cy = p.reduce((s, q) => s + q.y, 0) / p.length;
    const d = p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
    return { s: tf.s, x: tf.x, y: tf.y, d, cx, cy };
  };
  const onMove = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !start.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    const cx = p.reduce((s, q) => s + q.x, 0) / p.length;
    const cy = p.reduce((s, q) => s + q.y, 0) / p.length;
    const st = start.current;
    let s = st.s;
    if (p.length > 1 && st.d > 0) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      s = Math.min(4, Math.max(1, (st.s * d) / st.d));
    }
    setTf({ s, x: st.x + (cx - st.cx), y: st.y + (cy - st.cy) });
  };
  const onUp = (e: PointerEvent) => {
    pts.current.delete(e.pointerId);
    start.current = pts.current.size ? snapshot() : null;
  };
  return (
    <FullPage title="武士总览（只读，双指缩放）" testId="overview">
      <div
        class="overview-pane"
        style={{ touchAction: 'none', overflow: 'hidden', borderRadius: '8px' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        data-testid="overview-pane"
      >
        <div style={{ transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.s})`, transformOrigin: '50% 50%' }} data-testid="overview-inner" data-scale={tf.s.toFixed(2)}>
          <Board g={geo} givens={g.puzzle.givens} values={g.values} notes={g.notes} pixelWidth={360 * tf.s} label="武士总览" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' }}>
        <button class="btn" onClick={() => setTf((t) => ({ ...t, s: Math.min(4, t.s * 1.4) }))} data-testid="zoom-in">
          放大
        </button>
        <button class="btn" onClick={() => setTf((t) => ({ ...t, s: Math.max(1, t.s / 1.4) }))}>
          缩小
        </button>
        <button class="btn" onClick={() => setTf({ s: 1, x: 0, y: 0 })}>
          复位
        </button>
      </div>
    </FullPage>
  );
}

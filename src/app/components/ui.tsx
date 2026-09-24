// 通用界面组件：弹层外壳、开关、分段选择、可按压（即时反馈 + 长按）。
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { closeLayer } from '../nav';
import { IconBack, IconClose } from '../icons';

export function Sheet(props: { title?: string; children: ComponentChildren; onClose?: () => void; testId?: string }) {
  const close = props.onClose ?? closeLayer;
  return (
    <div class="layer" role="dialog" aria-modal="true" aria-label={props.title} data-testid={props.testId}>
      <div class="scrim" onClick={close} />
      <div class="sheet">
        <div class="grabber" />
        {props.title && (
          <div class="sheet-head">
            <h2>{props.title}</h2>
            <button class="icon-btn" aria-label="关闭" onClick={close}>
              <IconClose />
            </button>
          </div>
        )}
        {props.children}
      </div>
    </div>
  );
}

export function FullPage(props: { title: string; children: ComponentChildren; actions?: ComponentChildren; testId?: string }) {
  return (
    <div class="layer" role="dialog" aria-modal="true" aria-label={props.title} data-testid={props.testId}>
      <div class="fullpage">
        <div class="fp-head">
          <button class="icon-btn" aria-label="返回" onClick={closeLayer} data-testid="fp-back">
            <IconBack />
          </button>
          <h2>{props.title}</h2>
          {props.actions}
        </div>
        <div class="fp-body">
          <div class="page">{props.children}</div>
        </div>
      </div>
    </div>
  );
}

export function Dialog(props: { title: string; children: ComponentChildren; actions: ComponentChildren; testId?: string; onScrim?: () => void }) {
  return (
    <div class="layer" role="alertdialog" aria-modal="true" aria-label={props.title} data-testid={props.testId}>
      <div class="scrim" onClick={props.onScrim ?? closeLayer} />
      <div class="dialog">
        <h2>{props.title}</h2>
        {props.children}
        <div class="actions">{props.actions}</div>
      </div>
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <button
      class="switch"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      data-testid={props.testId}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}

export function Seg<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId?: string }) {
  return (
    <div class="seg" role="radiogroup" data-testid={props.testId}>
      {props.options.map((o) => (
        <button
          role="radio"
          aria-checked={o.value === props.value}
          class={o.value === props.value ? 'on' : ''}
          onClick={() => props.onChange(o.value)}
          data-value={o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 统一的按压处理（Pointer Events）：按下立即加 pressed 样式；
 * 长按 = 计时器 + 移动阈值判定，pointercancel 时取消。
 */
export function usePress(onTap: () => void, onLongPress?: () => void, longMs = 420) {
  const st = useRef<{ timer: number | null; x: number; y: number; fired: boolean; el: HTMLElement | null; id: number }>({
    timer: null,
    x: 0,
    y: 0,
    fired: false,
    el: null,
    id: -1,
  });
  useEffect(() => () => {
    if (st.current.timer) clearTimeout(st.current.timer);
  }, []);
  const clear = () => {
    const s = st.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    s.el?.classList.remove('pressed');
  };
  const handlers: Pick<
    JSX.HTMLAttributes<HTMLButtonElement>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onPointerLeave' | 'onContextMenu' | 'onClick' | 'onKeyDown'
  > = {
    onPointerDown: (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const s = st.current;
      s.el = e.currentTarget as HTMLElement;
      s.el.classList.add('pressed');
      s.x = e.clientX;
      s.y = e.clientY;
      s.fired = false;
      s.id = e.pointerId;
      if (onLongPress) {
        s.timer = window.setTimeout(() => {
          s.timer = null;
          s.fired = true;
          onLongPress();
        }, longMs);
      }
    },
    onPointerMove: (e) => {
      const s = st.current;
      if (e.pointerId !== s.id || !s.timer) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) clear();
    },
    onPointerUp: (e) => {
      const s = st.current;
      if (e.pointerId !== s.id) return;
      const wasPending = s.timer !== null || !onLongPress;
      clear();
      if (!s.fired && wasPending) onTap();
      s.id = -1;
    },
    onPointerCancel: () => {
      clear();
      st.current.id = -1;
    },
    onPointerLeave: () => {
      clear();
    },
    onContextMenu: (e) => e.preventDefault(),
    // 键盘/读屏用户（非触控）仍可激活
    onClick: (e) => {
      if ((e as MouseEvent).detail === 0) onTap();
    },
  };
  return handlers;
}

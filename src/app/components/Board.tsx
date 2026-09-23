// SVG 盘面渲染器：所有模式共用；游戏、规则示例、技巧教程、缩略图都用它画。
import { memo } from 'preact/compat';
import { useMemo, useRef } from 'preact/hooks';
import { DIGITS } from '../../engine/bits';
import { SAMURAI_GRID_NAMES, type Geometry } from '../../engine/geometry';
import type { CellDigit, ChainLink } from '../../engine/human/state';
import type { Cage } from '../../engine/types';

const U = 100; // 每格的 SVG 单位

export interface BoardMarks {
  area?: number[];
  keys?: CellDigit[];
  keys2?: CellDigit[];
  elims?: CellDigit[];
  links?: ChainLink[];
  /** 需要标红“违规”的格（规则示例用） */
  bad?: number[];
  /** 需要标绿“正确”的格（规则示例用） */
  good?: number[];
}

export interface BoardProps {
  g: Geometry;
  givens: number[];
  values: number[];
  notes?: number[];
  cages?: Cage[];
  /** 只画这些格（武士放大视图：一个子盘的 81 格）；缺省画全部 */
  subgrid?: number;
  selected?: number | null;
  focusDigit?: number | null;
  hlUnits?: boolean;
  hlSameDigit?: boolean;
  hlNotes?: boolean;
  jigsawTint?: boolean;
  conflicts?: Set<number>;
  wrong?: Set<number>;
  marks?: BoardMarks;
  /** 最近填入的格（轻弹动画） */
  pop?: { cell: number; key: number } | null;
  /** 单元完成波纹 */
  ripple?: { cells: number[]; origin: number; key: number } | null;
  /** 通关整盘涟漪 */
  winWave?: number | null;
  onCellDown?: (cell: number) => void;
  /** 渲染的像素宽度（用于把“约 4px”的笼内缩换算成 SVG 单位） */
  pixelWidth?: number;
  label?: string;
  class?: string;
  /** 共享宫角标（武士放大视图） */
  sharedBadges?: boolean;
  testId?: string;
  /** 盘面修订号：values/notes 是原地修改的数组，靠它让 memo 知道内容变了 */
  rev?: string | number;
}

const REGION_TINTS = [
  'var(--tint-0)',
  'var(--tint-1)',
  'var(--tint-2)',
  'var(--tint-3)',
  'var(--tint-4)',
  'var(--tint-5)',
  'var(--tint-6)',
  'var(--tint-7)',
  'var(--tint-8)',
];

export const Board = memo(function Board(p: BoardProps) {
  const { g } = p;
  const svgRef = useRef<SVGSVGElement>(null);

  // 视图：要画的格子与坐标映射
  const view = useMemo(() => {
    let cells: number[];
    let r0 = 0;
    let c0 = 0;
    let W = g.width;
    let H = g.height;
    if (p.subgrid !== undefined && g.mode === 'samurai') {
      const sg = g.grids[p.subgrid];
      cells = sg.cells;
      r0 = sg.originRow;
      c0 = sg.originCol;
      W = 9;
      H = 9;
    } else {
      cells = Array.from({ length: g.size }, (_, i) => i);
    }
    const inView = new Set(cells);
    const pos = (c: number) => ({ x: (g.cellCol[c] - c0) * U, y: (g.cellRow[c] - r0) * U });
    return { cells, inView, r0, c0, W, H, pos };
  }, [g, p.subgrid]);

  const cellAt = (r: number, c: number) => {
    const rr = r + view.r0;
    const cc = c + view.c0;
    if (rr < 0 || cc < 0 || rr >= g.height || cc >= g.width) return -1;
    const x = g.cellAt[rr * g.width + cc];
    return x >= 0 && view.inView.has(x) ? x : -1;
  };

  const cageOf = useMemo(() => {
    const m = new Int16Array(g.size).fill(-1);
    p.cages?.forEach((cg, i) => cg.cells.forEach((c) => (m[c] = i)));
    return m;
  }, [g, p.cages]);

  // 选中格相关的单元与笼
  const related = useMemo(() => {
    const s = new Set<number>();
    if (p.selected == null || !p.hlUnits) return s;
    for (const uid of g.cellUnits[p.selected]) for (const c of g.units[uid].cells) s.add(c);
    const ci = cageOf[p.selected];
    if (ci >= 0) for (const c of p.cages![ci].cells) s.add(c);
    return s;
  }, [g, p.selected, p.hlUnits, cageOf, p.cages]);

  const selectedCage = p.selected != null ? cageOf[p.selected] : -1;
  const pxPerUnit = (p.pixelWidth ?? 360) / (view.W * U);
  const inset = Math.min(14, Math.max(6, 4 / pxPerUnit));

  const onPointerDown = (e: PointerEvent) => {
    if (!p.onCellDown || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * view.W;
    const y = ((e.clientY - rect.top) / rect.height) * view.H;
    const c = cellAt(Math.floor(y), Math.floor(x));
    if (c >= 0) {
      e.preventDefault();
      p.onCellDown(c);
    }
  };

  const focus = p.focusDigit ?? null;
  const areaSet = useMemo(() => new Set(p.marks?.area ?? []), [p.marks]);
  const badSet = useMemo(() => new Set(p.marks?.bad ?? []), [p.marks]);
  const goodSet = useMemo(() => new Set(p.marks?.good ?? []), [p.marks]);
  const keyMap = useMemo(() => markMap(p.marks?.keys), [p.marks]);
  const key2Map = useMemo(() => markMap(p.marks?.keys2), [p.marks]);
  const elimMap = useMemo(() => markMap(p.marks?.elims), [p.marks]);

  // 杀手笼：和数所在格（左上角格）
  const sumCell = useMemo(() => {
    const m = new Map<number, number>();
    p.cages?.forEach((cg) => {
      const top = cg.cells.slice().sort((a, b) => g.cellRow[a] - g.cellRow[b] || g.cellCol[a] - g.cellCol[b])[0];
      m.set(top, cg.sum);
    });
    return m;
  }, [g, p.cages]);

  const rippleDelay = (c: number) => {
    if (!p.ripple) return 0;
    const o = p.ripple.origin;
    const d = Math.abs(g.cellRow[c] - g.cellRow[o]) + Math.abs(g.cellCol[c] - g.cellCol[o]);
    return d * 22;
  };
  const rippleSet = useMemo(() => new Set(p.ripple?.cells ?? []), [p.ripple]);

  // ---------- 背景层 ----------
  const bg: preact.JSX.Element[] = [];
  for (const c of view.cells) {
    const { x, y } = view.pos(c);
    let fill: string | null = null;
    const cls = 'cell-bg';
    if (p.jigsawTint && g.mode === 'jigsaw') {
      bg.push(<rect key={`t${c}`} x={x} y={y} width={U} height={U} fill={REGION_TINTS[g.boxOf[c]]} />);
    }
    if (p.selected === c) {
      fill = 'var(--hl-selected)';
    } else if (focus && p.hlSameDigit && p.values[c] === focus) {
      fill = 'var(--hl-same)';
    } else if (related.has(c)) {
      fill = 'var(--hl-related)';
    }
    if (badSet.has(c)) fill = 'var(--danger-soft)';
    if (goodSet.has(c)) fill = 'var(--success-soft)';
    if (fill) bg.push(<rect key={`h${c}`} x={x} y={y} width={U} height={U} fill={fill} class={cls} />);
    if (areaSet.has(c)) bg.push(<rect key={`a${c}`} x={x} y={y} width={U} height={U} class="hint-area" />);
    if (rippleSet.has(c))
      bg.push(
        <rect
          key={`r${c}-${p.ripple!.key}`}
          x={x}
          y={y}
          width={U}
          height={U}
          class="ripple"
          style={{ animationDelay: `${rippleDelay(c)}ms` }}
        />,
      );
    if (p.winWave != null) {
      const d = g.cellRow[c] + g.cellCol[c];
      bg.push(
        <rect key={`w${c}-${p.winWave}`} x={x} y={y} width={U} height={U} class="ripple win" style={{ animationDelay: `${d * 28}ms` }} />,
      );
    }
  }

  // ---------- 网格线 ----------
  const thin: string[] = [];
  const thick: string[] = [];
  const sameBox = (a: number, b: number) => {
    if (g.mode !== 'samurai') return g.boxOf[a] === g.boxOf[b];
    // 武士：同一子盘的同一宫
    return g.cellGrids[a].some((gi) => g.cellGrids[b].includes(gi) && boxInGrid(g, a, gi) === boxInGrid(g, b, gi));
  };
  for (const c of view.cells) {
    const { x, y } = view.pos(c);
    const r = g.cellRow[c] - view.r0;
    const col = g.cellCol[c] - view.c0;
    const right = cellAt(r, col + 1);
    const down = cellAt(r + 1, col);
    const left = cellAt(r, col - 1);
    const up = cellAt(r - 1, col);
    // 右边
    if (right < 0 || !sameBox(c, right)) thick.push(`M${x + U} ${y}V${y + U}`);
    else thin.push(`M${x + U} ${y}V${y + U}`);
    if (down < 0 || !sameBox(c, down)) thick.push(`M${x} ${y + U}H${x + U}`);
    else thin.push(`M${x} ${y + U}H${x + U}`);
    if (left < 0) thick.push(`M${x} ${y}V${y + U}`);
    if (up < 0) thick.push(`M${x} ${y}H${x + U}`);
  }

  // ---------- 杀手笼虚线（内缩约 4px） ----------
  const cagePaths: preact.JSX.Element[] = [];
  p.cages?.forEach((cg, ci) => {
    const set = new Set(cg.cells.filter((c) => view.inView.has(c)));
    if (!set.size) return;
    const d = inset;
    const segs: string[] = [];
    const has = (r: number, c: number) => {
      const x = cellAt(r, c);
      return x >= 0 && set.has(x);
    };
    for (const c of set) {
      const r = g.cellRow[c] - view.r0;
      const col = g.cellCol[c] - view.c0;
      const x0 = col * U;
      const y0 = r * U;
      const L = has(r, col - 1);
      const R = has(r, col + 1);
      const T = has(r - 1, col);
      const B = has(r + 1, col);
      if (!T) {
        const xa = L ? (has(r - 1, col - 1) ? x0 - d : x0) : x0 + d;
        const xb = R ? (has(r - 1, col + 1) ? x0 + U + d : x0 + U) : x0 + U - d;
        segs.push(`M${xa} ${y0 + d}H${xb}`);
      }
      if (!B) {
        const xa = L ? (has(r + 1, col - 1) ? x0 - d : x0) : x0 + d;
        const xb = R ? (has(r + 1, col + 1) ? x0 + U + d : x0 + U) : x0 + U - d;
        segs.push(`M${xa} ${y0 + U - d}H${xb}`);
      }
      if (!L) {
        const ya = T ? (has(r - 1, col - 1) ? y0 - d : y0) : y0 + d;
        const yb = B ? (has(r + 1, col - 1) ? y0 + U + d : y0 + U) : y0 + U - d;
        segs.push(`M${x0 + d} ${ya}V${yb}`);
      }
      if (!R) {
        const ya = T ? (has(r - 1, col + 1) ? y0 - d : y0) : y0 + d;
        const yb = B ? (has(r + 1, col + 1) ? y0 + U + d : y0 + U) : y0 + U - d;
        segs.push(`M${x0 + U - d} ${ya}V${yb}`);
      }
    }
    cagePaths.push(<path key={`cg${ci}`} d={segs.join('')} class={ci === selectedCage ? 'cage sel' : 'cage'} />);
  });

  // ---------- 对角线 ----------
  const diag =
    g.mode === 'diagonal' ? (
      <g class="diag">
        <line x1={0} y1={0} x2={9 * U} y2={9 * U} />
        <line x1={9 * U} y1={0} x2={0} y2={9 * U} />
      </g>
    ) : null;

  // ---------- 数字与笔记 ----------
  const fg: preact.JSX.Element[] = [];
  for (const c of view.cells) {
    const { x, y } = view.pos(c);
    const v = p.values[c];
    const given = p.givens[c] !== 0;
    const conflict = p.conflicts?.has(c);
    const wrong = p.wrong?.has(c);
    const sum = sumCell.get(c);
    if (sum !== undefined) {
      const txt = String(sum);
      const w = 12 + txt.length * 13;
      fg.push(
        <g key={`s${c}`} class="cage-sum">
          <rect x={x + inset - 3} y={y + inset - 3} width={w} height={26} rx={4} />
          <text x={x + inset + 2} y={y + inset + 17}>
            {txt}
          </text>
        </g>,
      );
    }
    if (v) {
      const popKey = p.pop && p.pop.cell === c ? p.pop.key : 0;
      fg.push(
        <text
          key={`v${c}-${popKey}`}
          x={x + U / 2}
          y={y + U / 2 + (sum !== undefined ? 6 : 0)}
          class={`digit ${given ? 'given' : 'player'}${conflict || wrong ? ' bad' : ''}${popKey ? ' pop' : ''}`}
          style={{ transformOrigin: `${x + U / 2}px ${y + U / 2}px` }}
        >
          {v}
        </text>,
      );
      if (conflict || wrong) {
        // 冲突不只靠颜色：右上角加警示标记；判错模式再加删除线
        fg.push(
          <g key={`x${c}`} class="bad-mark">
            <circle cx={x + U - 16} cy={y + 16} r={10} />
            <text x={x + U - 16} y={y + 17}>
              !
            </text>
          </g>,
        );
        if (wrong) fg.push(<line key={`xl${c}`} class="wrong-line" x1={x + 22} y1={y + U - 24} x2={x + U - 22} y2={y + 24} />);
      }
    } else if (p.notes && p.notes[c]) {
      const shrink = sum !== undefined; // 笼和所在格：笔记避开左上角
      const ox = shrink ? x + 26 : x + 4;
      const oy = shrink ? y + 26 : y + 4;
      const cw = shrink ? (U - 30) / 3 : (U - 8) / 3;
      for (const d of DIGITS[p.notes[c]]) {
        const col = (d - 1) % 3;
        const row = Math.floor((d - 1) / 3);
        const cx = ox + cw * col + cw / 2;
        const cy = oy + cw * row + cw / 2;
        const isFocus = p.hlNotes && focus === d;
        fg.push(
          <text key={`n${c}-${d}`} x={cx} y={cy} class={`note${isFocus ? ' focus' : ''}`} style={{ fontSize: shrink ? '20px' : '25px' }}>
            {d}
          </text>,
        );
      }
    }
    // 提示标记（候选层）
    const drawMark = (map: Map<number, number>, cls: string) => {
      const m = map.get(c);
      if (!m) return;
      for (const d of DIGITS[m]) {
        const col = (d - 1) % 3;
        const row = Math.floor((d - 1) / 3);
        const cw = (U - 8) / 3;
        const cx = x + 4 + cw * col + cw / 2;
        const cy = y + 4 + cw * row + cw / 2;
        fg.push(<circle key={`${cls}${c}-${d}`} cx={cx} cy={cy} r={13} class={cls} />);
        if (!v && !(p.notes && p.notes[c] & (1 << (d - 1))))
          fg.push(
            <text key={`${cls}t${c}-${d}`} x={cx} y={cy} class="note mark-digit">
              {d}
            </text>,
          );
      }
    };
    if (!v) {
      drawMark(keyMap, 'mk-key');
      drawMark(key2Map, 'mk-key2');
      drawMark(elimMap, 'mk-elim');
    }
  }

  const linkEls = (p.marks?.links ?? [])
    .filter((l) => view.inView.has(l.from.cell) && view.inView.has(l.to.cell))
    .map((l, i) => {
      const a = notePos(view.pos(l.from.cell), l.from.digit);
      const b = notePos(view.pos(l.to.cell), l.to.digit);
      return <line key={`l${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} class={l.strong ? 'link strong' : 'link weak'} />;
    });

  // 武士共享宫角标
  const badges: preact.JSX.Element[] = [];
  if (p.sharedBadges && g.mode === 'samurai' && p.subgrid !== undefined) {
    for (const u of g.units) {
      if (u.type !== 'box' || u.grids.length < 2 || !u.grids.includes(p.subgrid)) continue;
      const other = u.grids.find((x) => x !== p.subgrid)!;
      const tl = u.cells.reduce((best, c) => (g.cellRow[c] + g.cellCol[c] < g.cellRow[best] + g.cellCol[best] ? c : best), u.cells[0]);
      const { x, y } = view.pos(tl);
      badges.push(
        <g key={`b${u.id}`} class="shared-badge">
          <rect x={x + 3 * U - 118} y={y + 3 * U - 34} width={112} height={28} rx={8} />
          <text x={x + 3 * U - 62} y={y + 3 * U - 15}>
            {`共享·${SAMURAI_GRID_NAMES[other]}`}
          </text>
        </g>,
      );
    }
  }

  return (
    <svg
      ref={svgRef}
      class={`board ${p.class ?? ''}`}
      viewBox={`-2 -2 ${view.W * U + 4} ${view.H * U + 4}`}
      onPointerDown={onPointerDown}
      data-no-menu
      role="grid"
      aria-label={p.label ?? '数独盘面'}
      data-testid={p.testId}
    >
      {view.cells.map((c) => {
        const { x, y } = view.pos(c);
        return <rect key={`s${c}`} x={x} y={y} width={U} height={U} class="cell-surface" data-cell={c} />;
      })}
      {bg}
      {diag}
      <path d={thin.join('')} class="grid-thin" />
      {cagePaths}
      <path d={thick.join('')} class="grid-thick" />
      {fg}
      {linkEls}
      {badges}
    </svg>
  );
});

function boxInGrid(g: Geometry, c: number, gi: number): number {
  const sg = g.grids[gi];
  const r = g.cellRow[c] - sg.originRow;
  const col = g.cellCol[c] - sg.originCol;
  return Math.floor(r / 3) * 3 + Math.floor(col / 3);
}

function markMap(list?: CellDigit[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const k of list ?? []) m.set(k.cell, (m.get(k.cell) ?? 0) | (1 << (k.digit - 1)));
  return m;
}

function notePos(p: { x: number; y: number }, d: number) {
  const cw = (U - 8) / 3;
  return { x: p.x + 4 + cw * ((d - 1) % 3) + cw / 2, y: p.y + 4 + cw * Math.floor((d - 1) / 3) + cw / 2 };
}

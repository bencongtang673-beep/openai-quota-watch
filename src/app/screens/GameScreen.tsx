import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DIGITS } from '../../engine/bits';
import { combosFor } from '../../engine/combos';
import { cellName, getGeometry, SAMURAI_GRID_NAMES } from '../../engine/geometry';
import { TECH_BY_ID } from '../../engine/human/state';
import { LEVEL_NAMES, MODE_NAMES } from '../../engine/types';
import { conflictCells, digitCounts, digitTotal, geometryOf, progressPct, wrongCells, type GameState } from '../../game/game';
import {
  applyHint,
  backToHome,
  dismissHint,
  doUndo,
  elapsedNow,
  eraseSelected,
  hintPress,
  holdClock,
  longPressDigit,
  markComboUsed,
  releaseClock,
  pauseGame,
  pressDigit,
  resumeGame,
  selectCell,
  setSamuraiGrid,
  toggleNoteMode,
} from '../actions';
import { Board } from '../components/Board';
import { usePress } from '../components/ui';
import { IconBack, IconBulb, IconErase, IconGear, IconGrid, IconHelp, IconMore, IconPause, IconPencil, IconPlay, IconUndo } from '../icons';
import { openLayer } from '../nav';
import { fmtTime } from '../stats';
import { useApp } from '../store';

export function GameScreen() {
  const app = useApp();
  const g = app.current!;
  const s = app.settings;
  const ui = app.ui;
  const geo = geometryOf(g.puzzle);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [boardPx, setBoardPx] = useState(320);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBoardPx(Math.max(140, Math.floor(Math.min(r.width, r.height))));
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [g.puzzle.mode]);

  // 有弹层盖在对局上时暂停计时（不遮盖盘面），弹层关闭后恢复
  const layerOpen = app.layers.length > 0;
  useEffect(() => {
    if (!layerOpen) return undefined;
    holdClock();
    return () => releaseClock();
  }, [layerOpen]);

  const conflicts = useMemo(() => (s.errorMode === 'conflict' ? conflictCells(g) : new Set<number>()), [g.values.join(), s.errorMode]);
  const wrong = useMemo(() => (s.errorMode === 'answer' ? wrongCells(g) : new Set<number>()), [g.values.join(), s.errorMode]);
  const counts = digitCounts(g);
  const total = digitTotal(g.puzzle.mode, geo.size);
  const sel = ui.selected;
  const focusDigit = ui.lockMode ? ui.lockDigit : sel != null && g.values[sel] ? g.values[sel] : null;

  const hint = ui.hint;
  const marks = hint
    ? {
        area: hint.area,
        keys: ui.hintStage >= 3 ? hint.keys : undefined,
        keys2: ui.hintStage >= 3 ? hint.keys2 : undefined,
        elims: ui.hintStage >= 3 ? hint.eliminations : undefined,
        links: ui.hintStage >= 3 ? hint.links : undefined,
      }
    : undefined;

  const samurai = g.puzzle.mode === 'samurai';
  const subgrid = samurai ? g.grid ?? 2 : undefined;

  return (
    <div class="game" data-testid="game">
      <div class="topbar">
        <button class="icon-btn" aria-label="返回首页" onClick={backToHome} data-testid="game-back">
          <IconBack />
        </button>
        <div class="title">
          <span class="t1" data-testid="game-title">
            {MODE_NAMES[g.puzzle.mode]} · {LEVEL_NAMES[g.puzzle.level]}
          </span>
          <span class="t2 digits">
            {s.showTimer && <span data-testid="timer">{fmtTime(elapsedNow())}</span>}
            {s.errorMode === 'answer' && (
              <span data-testid="errors">
                错误 {g.errors}
                {s.threeStrikes ? '/3' : ''}
              </span>
            )}
            <span>{progressPct(g)}%</span>
          </span>
        </div>
        <button class="icon-btn" aria-label="规则说明" onClick={() => openLayer({ type: 'rules', mode: g.puzzle.mode })} data-testid="rules-btn">
          <IconHelp />
        </button>
        <button
          class="icon-btn"
          aria-label={ui.paused ? '继续' : '暂停'}
          onClick={() => (ui.paused ? resumeGame() : pauseGame(false))}
          data-testid="pause-btn"
        >
          {ui.paused ? <IconPlay /> : <IconPause />}
        </button>
        <button class="icon-btn" aria-label="设置" onClick={() => openLayer({ type: 'settings' })} data-testid="settings-btn">
          <IconGear />
        </button>
      </div>

      <div class="game-body">
        <div class="board-wrap">
          {samurai && <SamuraiThumbs g={g} current={subgrid!} />}
          <div class="board-slot" ref={wrapRef}>
          <div class="board-box" style={{ width: boardPx + 'px' }}>
            <Board
              g={geo}
              givens={g.puzzle.givens}
              values={g.values}
              notes={g.notes}
              cages={g.puzzle.cages}
              subgrid={subgrid}
              selected={ui.paused ? null : sel}
              focusDigit={ui.paused ? null : focusDigit}
              hlUnits={s.hlUnits}
              hlSameDigit={s.hlSameDigit}
              hlNotes={s.hlNotes}
              jigsawTint={s.jigsawTint}
              conflicts={conflicts}
              wrong={wrong}
              marks={marks}
              pop={ui.pop}
              ripple={ui.ripple}
              winWave={ui.winWave}
              onCellDown={selectCell}
              pixelWidth={boardPx}
              sharedBadges={samurai}
              rev={`${g.undo.length}:${g.redo.length}`}
              testId="board"
              label={boardLabel(g, sel)}
            />
            {ui.paused && (
              <div class="pause-cover" data-testid="pause-cover">
                <div style={{ fontSize: '18px', fontWeight: 600 }}>{ui.autoPaused ? '已自动暂停' : '已暂停'}</div>
                <div class="muted small digits">用时 {fmtTime(elapsedNow())}</div>
                <button class="btn primary" onClick={resumeGame} data-testid="resume-btn">
                  <IconPlay size={20} /> 继续
                </button>
              </div>
            )}
          </div>
          </div>
          <Legend g={g} />
        </div>

        <div class="side">
          {hint && !ui.paused && (
            <div class="hint-bar">
              <div class="hint-card" data-testid="hint-card" role="status">
                {ui.hintStage === 1 && (
                  <>
                    <div class="hc-title">提示 ①：看看高亮区域</div>
                    <div class="hc-text">黄色区域里可以推进一步。再点一次「提示」看用什么技巧。</div>
                  </>
                )}
                {ui.hintStage === 2 && (
                  <>
                    <div class="hc-title" data-testid="hint-tech">提示 ②：{hint.techNames.join(' → ')}</div>
                    <div class="hc-text">再点一次「提示」看完整讲解。</div>
                  </>
                )}
                {ui.hintStage === 3 && (
                  <>
                    <div class="hc-title">提示 ③：{hint.techNames.join(' → ')}</div>
                    <div class="hc-text" data-testid="hint-text">
                      {hint.text}
                    </div>
                  </>
                )}
                <div class="hc-actions">
                  {ui.hintStage < 3 && (
                    <button class="btn" onClick={hintPress} data-testid="hint-next">
                      下一段
                    </button>
                  )}
                  <button class="btn primary" onClick={applyHint} data-testid="hint-apply">
                    {hint.kind === 'wrong' ? '擦掉它' : '一键应用'}
                  </button>
                  <button class="btn ghost" onClick={dismissHint}>
                    关闭
                  </button>
                </div>
                {hint.kind === 'step' && hint.steps.length > 0 && ui.hintStage === 3 && (
                  <div class="muted small" style={{ marginTop: '6px' }}>
                    技巧档位：{Math.max(...hint.steps.map((x) => TECH_BY_ID[x.tech].level))} 档
                  </div>
                )}
              </div>
            </div>
          )}
          {g.puzzle.mode === 'killer' && s.comboHelper && sel != null && !ui.paused && <ComboHelper g={g} cell={sel} />}
          <div class="controls">
            <Toolbar />
            <NumPad counts={counts} total={total} />
          </div>
        </div>
      </div>
    </div>
  );
}

function boardLabel(g: GameState, sel: number | null): string {
  const geo = geometryOf(g.puzzle);
  const base = `${MODE_NAMES[g.puzzle.mode]}盘面，进度 ${progressPct(g)}%`;
  if (sel == null) return base;
  const v = g.values[sel];
  const what = v ? `${g.puzzle.givens[sel] ? '给定数' : '已填'} ${v}` : g.notes[sel] ? `笔记 ${DIGITS[g.notes[sel]].join(' ')}` : '空格';
  return `${base}。已选中 ${cellName(geo, sel)}：${what}`;
}

function Toolbar() {
  const app = useApp();
  const ui = app.ui;
  const undo = usePress(doUndo);
  const erase = usePress(eraseSelected);
  const note = usePress(toggleNoteMode);
  const hint = usePress(hintPress);
  const more = usePress(() => openLayer({ type: 'menu' }));
  return (
    <div class="toolbar" role="toolbar" aria-label="工具条">
      <button class="tool" {...undo} aria-label="撤销" data-testid="tool-undo">
        <IconUndo />
        撤销
      </button>
      <button class="tool" {...erase} aria-label="擦除" data-testid="tool-erase">
        <IconErase />
        擦除
      </button>
      <button class={`tool ${ui.noteMode ? 'on' : ''}`} {...note} aria-label="笔记" aria-pressed={ui.noteMode} data-testid="tool-note">
        <IconPencil />
        笔记
        <span class="tool-flag">{ui.noteMode ? '开' : '关'}</span>
      </button>
      <button class="tool" {...hint} aria-label="提示" data-testid="tool-hint">
        <IconBulb />
        提示
      </button>
      <button class="tool" {...more} aria-label="更多" data-testid="tool-more">
        <IconMore />
        更多
      </button>
    </div>
  );
}

function NumKey(props: { d: number; left: number; locked: boolean }) {
  const h = usePress(
    () => pressDigit(props.d),
    () => longPressDigit(props.d),
  );
  return (
    <button
      class={`key ${props.left <= 0 ? 'done' : ''} ${props.locked ? 'locked' : ''}`}
      {...h}
      aria-label={`数字 ${props.d}，剩余 ${Math.max(0, props.left)} 个`}
      data-testid={`key-${props.d}`}
    >
      <span class="kd">{props.d}</span>
      <span class="kc">{Math.max(0, props.left)}</span>
    </button>
  );
}

function NumPad(props: { counts: number[]; total: number }) {
  const app = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<1 | 2 | 3>(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 触控目标 ≥48px：一行放不下 9 个就分两行（5+4），再窄（如 200% 缩放）就 3×3
    const m = () => {
      const w = el.getBoundingClientRect().width;
      setRows(w >= 9 * 48 + 8 * 6 ? 1 : w >= 5 * 48 + 4 * 6 ? 2 : 3);
    };
    m();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(m);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, []);
  return (
    <div
      ref={ref}
      class={`numpad ${rows === 2 ? 'two-rows' : rows === 3 ? 'three-rows' : ''} ${app.ui.noteMode ? 'notes-on' : ''}`}
      data-testid="numpad"
      data-no-menu
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
        <NumKey key={d} d={d} left={props.total - props.counts[d]} locked={app.ui.lockMode && app.ui.lockDigit === d} />
      ))}
    </div>
  );
}

function Legend({ g }: { g: GameState }) {
  const m = g.puzzle.mode;
  if (m === 'classic') return null;
  return (
    <div class="legend" data-testid="legend">
      {m === 'diagonal' && (
        <span>
          <svg viewBox="0 0 22 22">
            <line x1="2" y1="2" x2="20" y2="20" stroke="var(--grid-thin)" stroke-width="1.5" stroke-dasharray="2 3" />
          </svg>
          两条对角线也各含 1–9
        </span>
      )}
      {m === 'jigsaw' && (
        <span>
          <svg viewBox="0 0 22 22">
            <path d="M2 2h12v8h6v10H2z" fill="var(--tint-2)" stroke="var(--grid-thick)" stroke-width="2" />
          </svg>
          粗框区域各含 1–9
        </span>
      )}
      {m === 'killer' && (
        <span>
          <svg viewBox="0 0 22 22">
            <rect x="3" y="3" width="16" height="16" fill="none" stroke="var(--cage-line)" stroke-dasharray="2 2" />
            <text x="5" y="10" font-size="7" fill="var(--ink-soft)">
              12
            </text>
          </svg>
          虚线笼：和为左上角数字，笼内不重复
        </span>
      )}
      {m === 'samurai' && (
        <span>
          <svg viewBox="0 0 22 22">
            <rect x="2" y="2" width="8" height="8" fill="none" stroke="var(--grid-thick)" />
            <rect x="12" y="12" width="8" height="8" fill="none" stroke="var(--grid-thick)" />
            <rect x="7" y="7" width="8" height="8" fill="var(--accent-soft)" stroke="var(--grid-thick)" />
          </svg>
          五盘各自满足标准规则，共享宫同时属于两盘
        </span>
      )}
    </div>
  );
}

function ComboHelper({ g, cell }: { g: GameState; cell: number }) {
  useEffect(() => markComboUsed(), []);
  const cg = g.puzzle.cages?.find((c) => c.cells.includes(cell));
  if (!cg) return null;
  const placed = cg.cells.map((c) => g.values[c]).filter(Boolean);
  const geo = geometryOf(g.puzzle);
  const combos = combosFor(cg.cells.length, cg.sum);
  // 划掉已被排除的组合：与笼内已填数冲突，或某数字在笼内所有空格都被同行/列/宫已填数排除
  const empties = cg.cells.filter((c) => !g.values[c]);
  const blocked = (d: number) =>
    empties.length > 0 &&
    empties.every((c) => geo.peers[c].some((p) => g.values[p] === d)) &&
    !placed.includes(d);
  return (
    <div class="combo-helper" data-testid="combo-helper" aria-label="笼组合助手">
      <span class="muted">
        {cg.cells.length} 格和 {cg.sum}：
      </span>
      {combos.map((m) => {
        const ds = DIGITS[m];
        const dead = placed.some((p) => !ds.includes(p)) || ds.some((d) => !placed.includes(d) && blocked(d));
        return dead ? <s key={m}>{ds.join('')}</s> : <b key={m}>{ds.join('')}</b>;
      })}
    </div>
  );
}

function SamuraiThumbs({ g, current }: { g: GameState; current: number }) {
  const geo = getGeometry('samurai');
  return (
    <div class="thumbs" data-testid="samurai-thumbs">
      {geo.grids.map((sg, gi) => {
        const filled = sg.cells.filter((c) => g.values[c]).length;
        return (
          <button
            key={gi}
            class={`thumb ${gi === current ? 'sel' : ''}`}
            onClick={() => setSamuraiGrid(gi)}
            aria-label={`${SAMURAI_GRID_NAMES[gi]}子盘，已填 ${filled}/81`}
            data-testid={`thumb-${gi}`}
          >
            <Board
              g={geo}
              givens={g.puzzle.givens}
              values={g.values}
              subgrid={gi}
              pixelWidth={60}
              class="thumb-board"
              rev={`${g.undo.length}:${g.redo.length}`}
            />
            <div class="tl digits">
              {SAMURAI_GRID_NAMES[gi]} {Math.round((filled / 81) * 100)}%
            </div>
          </button>
        );
      })}
      <button class="thumb" onClick={() => openLayer({ type: 'overview' })} aria-label="总览" data-testid="overview-btn">
        <IconGrid />
        <div class="tl">总览</div>
      </button>
    </div>
  );
}

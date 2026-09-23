import { useMemo, useRef, useState } from 'preact/hooks';
import { getGeometry, STANDARD_BOXES } from '../../engine/geometry';
import { LEVEL_NAMES, LEVELS, MODE_NAMES, MODES, type Level, type Mode } from '../../engine/types';
import { progressPct } from '../../game/game';
import { features } from '../../platform/env';
import { sound } from '../../platform/audio';
import {
  applySettingsSideEffects,
  beginGame,
  cancelGeneration,
  confirmAbandon,
  confirmRestart,
  continueGame,
  doAutoNotes,
  doRedo,
  resultDone,
  startNewGame,
  toggleLockMode,
  updateSettings,
} from '../actions';
import { backupToText, buildBackup, downloadFile, importBackup, parseBackup } from '../backup';
import { Board } from '../components/Board';
import { Dialog, FullPage, Seg, Sheet, Switch } from '../components/ui';
import {
  IconBackup,
  IconCombo,
  IconCopy,
  IconFlag,
  IconImport,
  IconLock,
  IconMagic,
  IconRedo,
  IconRestart,
  IconShare,
} from '../icons';
import { availableLevels, modeAvailable } from '../levels';
import { closeLayer, closeLayerThen, replaceLayer } from '../nav';
import { isPoolStopped, POOL_PER_SLOT, resumePoolFilling, stopPoolFilling } from '../pool';
import { decodeShare, shareText } from '../share';
import { computeStats, fmtAgo, fmtDate, fmtTime } from '../stats';
import { toast, useApp, type Layer } from '../store';
import { LEVEL_TECH_SUMMARY } from './help-data';

// ---------------- 新游戏 ----------------
export function NewGameLayer({ layer }: { layer: Extract<Layer, { type: 'newgame' }> }) {
  const a = useApp();
  const modes = MODES.filter(modeAvailable);
  const [mode, setMode] = useState<Mode>(layer.mode ?? modes[0]);
  return (
    <FullPage title="新游戏" testId="newgame">
      <h3 style={{ margin: '4px 0 8px' }}>模式</h3>
      <div class="mode-grid">
        {modes.map((m) => (
          <button key={m} class={`mode-card ${m === mode ? 'sel' : ''}`} onClick={() => setMode(m)} data-testid={`mode-${m}`}>
            <ModePreview mode={m} />
            <div class="mc-name">{MODE_NAMES[m]}</div>
          </button>
        ))}
      </div>
      <h3 style={{ margin: '18px 0 8px' }}>难度</h3>
      <div class="level-list">
        {availableLevels(mode).map((l) => {
          const pooled = a.poolCounts[`${mode}-${l}`] ?? 0;
          return (
            <button key={l} class="level-btn" onClick={() => startNewGame(mode, l)} data-testid={`level-${l}`}>
              <span class="level-dots" aria-hidden="true">
                {LEVELS.map((x) => (
                  <i key={x} class={x <= l ? 'on' : ''} />
                ))}
              </span>
              <span style={{ flex: 1 }}>
                <b>
                  {l} · {LEVEL_NAMES[l]}
                </b>
                <span class="mi-sub muted small" style={{ display: 'block' }}>
                  {LEVEL_TECH_SUMMARY[l]}
                </span>
              </span>
              {pooled > 0 && <span class="badge digits" title="已预备">{pooled}</span>}
            </button>
          );
        })}
      </div>
      <p class="muted small" style={{ marginTop: '12px' }}>
        难度由人类技巧求解器真实评出：档位 = 解题全程用到的最难技巧所在档。蓝色数字表示题池里已预备好、可立即开始的题数。
      </p>
    </FullPage>
  );
}

function ModePreview({ mode }: { mode: Mode }) {
  // 纯示意图：展示该模式的盘面结构（不是题目）
  const data = useMemo(() => {
    if (mode === 'samurai') {
      const g = getGeometry('samurai');
      return { g, givens: new Array(g.size).fill(0) };
    }
    if (mode === 'jigsaw') {
      const regions = STANDARD_BOXES.slice();
      // 固定的示意布局：交换几对边界格
      const swaps: [number, number][] = [
        [2, 3],
        [20, 29],
        [24, 33],
        [47, 56],
        [51, 60],
        [77, 78],
      ];
      for (const [a, b] of swaps) [regions[a], regions[b]] = [regions[b], regions[a]];
      const g = getGeometry('jigsaw', regions);
      return { g, givens: new Array(81).fill(0) };
    }
    const g = getGeometry(mode === 'killer' ? 'classic' : mode);
    return { g, givens: new Array(81).fill(0) };
  }, [mode]);
  const cages =
    mode === 'killer'
      ? [
          { cells: [0, 1], sum: 3 },
          { cells: [2, 11, 20], sum: 15 },
          { cells: [9, 10], sum: 11 },
          { cells: [18, 19, 27], sum: 12 },
        ]
      : undefined;
  return <Board g={data.g} givens={data.givens} values={data.givens} cages={cages} pixelWidth={110} jigsawTint />;
}

// ---------------- 出题中 ----------------
export function GeneratingLayer() {
  const a = useApp();
  const gen = a.gen;
  if (!gen) return null;
  const secs = Math.floor((Date.now() - gen.startedAt) / 1000);
  return (
    <Dialog
      title={gen.error ? '没能生成题目' : '正在出题…'}
      testId="generating"
      onScrim={() => undefined}
      actions={
        gen.error ? (
          <>
            <button class="btn" onClick={cancelGeneration}>
              返回
            </button>
            <button
              class="btn primary"
              onClick={() => {
                const { mode, level } = gen;
                cancelGeneration();
                setTimeout(() => startNewGame(mode, level), 80);
              }}
            >
              重试
            </button>
          </>
        ) : (
          <button class="btn" onClick={cancelGeneration} data-testid="gen-cancel">
            取消
          </button>
        )
      }
    >
      {gen.error ? (
        <p>{gen.error}</p>
      ) : (
        <>
          <div class="spinner" aria-hidden="true" />
          <p style={{ textAlign: 'center' }}>
            {MODE_NAMES[gen.mode]} · {LEVEL_NAMES[gen.level]}
          </p>
          <p class="muted small" style={{ textAlign: 'center' }}>
            第 {gen.attempts} 次尝试 · {secs} 秒 · 在本机生成并用技巧求解器评级
          </p>
        </>
      )}
    </Dialog>
  );
}

// ---------------- 未完成列表 ----------------
export function UnfinishedLayer() {
  const a = useApp();
  return (
    <FullPage title={`未完成的局（${a.games.length}）`} testId="unfinished">
      {!a.games.length && <p class="muted">没有未完成的局。</p>}
      <div class="list">
        {a.games.map((g) => (
          <div class="row-card" key={g.id} data-testid="unfinished-item">
            <div class="rc-main">
              <div class="rc-title">
                {MODE_NAMES[g.puzzle.mode]} · {LEVEL_NAMES[g.puzzle.level]}
                {g.imported ? ' · 导入' : ''}
              </div>
              <div class="rc-sub">
                进度 {progressPct(g)}% · 用时 <span class="digits">{fmtTime(g.elapsedMs)}</span> · 最后游玩 {fmtAgo(g.updatedAt)}
              </div>
              <div class="progress">
                <i style={{ width: progressPct(g) + '%' }} />
              </div>
            </div>
            <button class="btn primary" onClick={() => continueGame(g.id)} data-testid="unfinished-continue">
              继续
            </button>
            <button class="icon-btn" aria-label="放弃" onClick={() => confirmAbandon(g.id)} data-testid="unfinished-abandon">
              <IconFlag />
            </button>
          </div>
        ))}
      </div>
    </FullPage>
  );
}

// ---------------- 历史记录 ----------------
export function HistoryLayer() {
  const a = useApp();
  const [filter, setFilter] = useState<Mode | 'all'>('all');
  const rows = a.history.filter((h) => filter === 'all' || h.mode === filter);
  const RESULT = { won: '完成', lost: '失败', abandoned: '放弃' } as const;
  return (
    <FullPage title="历史记录" testId="history">
      <div class="chips" role="radiogroup">
        <button class={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          全部
        </button>
        {MODES.filter(modeAvailable).map((m) => (
          <button key={m} class={`chip ${filter === m ? 'on' : ''}`} onClick={() => setFilter(m)} data-testid={`hist-filter-${m}`}>
            {MODE_NAMES[m].replace('数独', '')}
          </button>
        ))}
      </div>
      {!rows.length && <p class="muted">还没有记录。</p>}
      <div class="list">
        {rows.map((h) => (
          <div class="row-card" key={h.id} data-testid="history-item">
            <div class="rc-main">
              <div class="rc-title">
                {MODE_NAMES[h.mode]} · {LEVEL_NAMES[h.level]}{' '}
                <span class={h.result === 'won' ? 'ok-tag' : 'bad-tag'}>{RESULT[h.result]}</span>
              </div>
              <div class="rc-sub digits">
                {fmtDate(h.date)} · 用时 {fmtTime(h.timeMs)} · 提示 {h.hints} · 错误 {h.errors}
                {h.assists ? ` · 辅助 ${h.assists}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </FullPage>
  );
}

// ---------------- 统计 ----------------
export function StatsLayer() {
  const a = useApp();
  return (
    <FullPage title="统计" testId="stats">
      {MODES.filter(modeAvailable).map((m) => (
        <section class="card" key={m}>
          <h2>{MODE_NAMES[m]}</h2>
          <div class="table-scroll">
            <table class="stats digits">
              <thead>
                <tr>
                  <th>难度</th>
                  <th>局数</th>
                  <th>胜率</th>
                  <th>最佳</th>
                  <th>平均</th>
                  <th>连胜</th>
                </tr>
              </thead>
              <tbody>
                {availableLevels(m).map((l) => {
                  const st = computeStats(a.history, m, l);
                  return (
                    <tr key={l} data-testid={`stat-${m}-${l}`}>
                      <td>{LEVEL_NAMES[l]}</td>
                      <td>{st.played}</td>
                      <td>{st.played ? Math.round(st.winRate * 100) + '%' : '—'}</td>
                      <td>{fmtTime(st.bestMs)}</td>
                      <td>{fmtTime(st.avgMs)}</td>
                      <td>
                        {st.streak}
                        <span class="muted">/{st.bestStreak}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p class="muted small">连胜：当前 / 最长。胜率把“失败”和“放弃”都算作未胜。</p>
        </section>
      ))}
    </FullPage>
  );
}

// ---------------- 更多菜单 ----------------
export function MenuLayer() {
  const a = useApp();
  const g = a.current;
  const item = (icon: preact.JSX.Element, label: string, sub: string, onClick: () => void, testId: string) => (
    <button class="menu-item" onClick={onClick} data-testid={testId}>
      <span class="mi-icon">{icon}</span>
      <span class="mi-text">
        {label}
        {sub && <span class="mi-sub">{sub}</span>}
      </span>
    </button>
  );
  return (
    <Sheet title="更多" testId="menu">
      <div class="menu-list">
        {item(<IconRedo />, '重做', g?.redo.length ? `可重做 ${g.redo.length} 步` : '没有可重做的操作', () => closeLayerThen(doRedo), 'menu-redo')}
        {item(<IconRestart />, '重开本题', '清空填写，可撤销', () => closeLayerThen(confirmRestart), 'menu-restart')}
        {item(<IconFlag />, '放弃本局', '需要二次确认', () => closeLayerThen(() => confirmAbandon()), 'menu-abandon')}
        {item(<IconShare />, '分享', '生成分享码发给朋友', () => g && doShare(g.puzzle), 'menu-share')}
        {item(<IconImport />, '导入', '粘贴分享码开新局', () => replaceLayer({ type: 'import' }), 'menu-import')}
        {item(<IconBackup />, '备份', '导出 / 导入全部数据', () => replaceLayer({ type: 'backup' }), 'menu-backup')}
        {item(<IconMagic />, '自动填候选', '计为使用了辅助', () => closeLayerThen(doAutoNotes), 'menu-autonotes')}
        {item(
          <IconLock />,
          a.ui.lockMode ? '退出数字锁定' : '数字锁定模式',
          '先选数字，再连续点格子',
          () => closeLayerThen(toggleLockMode),
          'menu-lock',
        )}
        {g?.puzzle.mode === 'killer' &&
          item(<IconCombo />, a.settings.comboHelper ? '关闭组合助手' : '打开组合助手', '显示所在笼的全部组合（计为辅助）', () => {
            updateSettings({ comboHelper: !a.settings.comboHelper });
            closeLayer();
          }, 'menu-combo')}
      </div>
    </Sheet>
  );
}

async function doShare(p: import('../../engine/types').PuzzleData) {
  const text = shareText(p);
  if (features.share) {
    try {
      await navigator.share({ title: '数独分享码', text });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  if (await copyText(text)) toast('分享码已复制到剪贴板');
  replaceLayer({ type: 'share', code: text });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (features.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 退化到 execCommand */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function ShareLayer({ layer }: { layer: Extract<Layer, { type: 'share' }> }) {
  return (
    <Sheet title="分享码" testId="share">
      <p class="small muted">把下面整段文字发给朋友，对方在「导入题目」里粘贴即可。</p>
      <textarea class="code" readOnly value={layer.code} data-testid="share-code" onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />
      <button
        class="btn primary block"
        style={{ marginTop: '8px' }}
        onClick={async () => toast((await copyText(layer.code)) ? '已复制' : '复制失败，请长按文本手动复制')}
      >
        <IconCopy size={20} /> 复制
      </button>
    </Sheet>
  );
}

// ---------------- 导入分享码 ----------------
export function ImportLayer() {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr('');
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20));
    try {
      const p = decodeShare(text);
      await beginGame(p, true);
      toast(`已导入：${MODE_NAMES[p.mode]} · ${LEVEL_NAMES[p.level]}`);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="导入题目" testId="import">
      <p class="small muted">粘贴朋友发来的分享码（整段文字也可以，会自动识别 SDK1. 开头的部分）。导入时会在本机重新验证唯一解并重新评级。</p>
      <textarea class="code" value={text} onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)} placeholder="SDK1.…" data-testid="import-text" />
      {err && (
        <p class="bad-tag small" role="alert" data-testid="import-error">
          {err}
        </p>
      )}
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        {features.clipboard && typeof navigator.clipboard.readText === 'function' && (
          <button
            class="btn"
            onClick={async () => {
              try {
                setText(await navigator.clipboard.readText());
              } catch {
                toast('无法读取剪贴板，请长按输入框粘贴');
              }
            }}
          >
            从剪贴板粘贴
          </button>
        )}
        <button class="btn primary" style={{ flex: 1 }} disabled={!text.trim() || busy} onClick={go} data-testid="import-go">
          {busy ? '验证中…' : '导入并开始'}
        </button>
      </div>
    </Sheet>
  );
}

// ---------------- 备份 ----------------
export function BackupLayer() {
  const a = useApp();
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const exportText = async () => {
    const b = await buildBackup();
    const t = backupToText(b);
    setCode(t);
    toast((await copyText(t)) ? '备份文本码已复制' : '已生成备份文本码，请手动复制');
  };
  const exportFile = async () => {
    const b = await buildBackup();
    const name = `sudoku-backup-${fmtDate(Date.now()).replace(/[ :]/g, '-')}.json`;
    const text = JSON.stringify(b);
    const file = typeof File !== 'undefined' ? new File([text], name, { type: 'application/json' }) : null;
    // iOS 上下载文件体验差：优先用系统分享面板“存储到文件”
    if (file && features.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '数独备份' });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    downloadFile(name, text);
  };
  const doImport = async (text: string) => {
    setMsg('');
    try {
      const b = parseBackup(text);
      const rep = await importBackup(b);
      applySettingsSideEffects();
      setMsg(
        `导入完成：新增残局 ${rep.gamesAdded}，更新 ${rep.gamesUpdated}，跳过 ${rep.gamesSkipped}；新增历史 ${rep.history} 条；新增已玩指纹 ${rep.fingerprints} 个。`,
      );
    } catch (e) {
      setMsg('导入失败：' + String((e as Error).message ?? e));
    }
  };
  return (
    <FullPage title="备份" testId="backup">
      <section class="card">
        <h2>导出备份</h2>
        <p class="small muted">
          包含全部 {a.games.length} 个残局（含完整撤销历史）、{a.history.length} 条历史记录、统计、设置和 {a.fingerprints.size} 个已玩题目指纹。iPhone 与安卓格式相同，可以互相导入。
        </p>
        <div class="stack">
          <button class="btn primary block" onClick={exportFile} data-testid="backup-export-file">
            导出为 JSON 文件
          </button>
          <button class="btn block" onClick={exportText} data-testid="backup-export-text">
            导出为文本码（复制到剪贴板）
          </button>
        </div>
        {code && <textarea class="code" readOnly value={code} style={{ marginTop: '8px' }} data-testid="backup-code" />}
      </section>
      <section class="card">
        <h2>导入备份</h2>
        <p class="small muted">导入是“合并”：不会删除本机已有的任何数据；同一残局以最后游玩时间较新的一份为准。</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,text/plain"
          class="hidden"
          data-testid="backup-file-input"
          onChange={async (e) => {
            const f = (e.currentTarget as HTMLInputElement).files?.[0];
            if (f) await doImport(await f.text());
            (e.currentTarget as HTMLInputElement).value = '';
          }}
        />
        <div class="stack">
          <button class="btn block" onClick={() => fileRef.current?.click()} data-testid="backup-import-file">
            选择备份文件
          </button>
          <textarea class="code" placeholder="或在这里粘贴 SDB1. 开头的文本码" value={input} onInput={(e) => setInput((e.currentTarget as HTMLTextAreaElement).value)} data-testid="backup-import-text" />
          <button class="btn primary block" disabled={!input.trim()} onClick={() => doImport(input)} data-testid="backup-import-go">
            导入文本码
          </button>
        </div>
        {msg && (
          <p class="small" role="status" data-testid="backup-msg">
            {msg}
          </p>
        )}
      </section>
      <section class="card">
        <h2>存储状态</h2>
        <p class="small">
          {a.persisted === true && '浏览器已授予“持久化存储”，系统清理空间时不会优先清除本 App 数据。'}
          {a.persisted === false && '浏览器未授予持久化存储。建议安装到主屏幕，并定期导出备份。'}
          {a.persisted === null && '此浏览器不支持持久化存储申请。建议安装到主屏幕，并定期导出备份。'}
        </p>
      </section>
    </FullPage>
  );
}

// ---------------- 确认框 ----------------
export function ConfirmLayer({ layer }: { layer: Extract<Layer, { type: 'confirm' }> }) {
  return (
    <Dialog
      title={layer.title}
      testId="confirm"
      actions={
        <>
          <button class="btn" onClick={closeLayer} data-testid="confirm-cancel">
            取消
          </button>
          <button
            class={`btn ${layer.danger ? 'danger' : 'primary'}`}
            data-testid="confirm-ok"
            onClick={() => closeLayerThen(layer.onOk)}
          >
            {layer.ok}
          </button>
        </>
      }
    >
      <p>{layer.message}</p>
    </Dialog>
  );
}

// ---------------- 成绩卡 ----------------
export function ResultLayer() {
  const a = useApp();
  const r = a.ui.lastResult;
  if (!r) return null;
  const e = r.entry;
  const won = e.result === 'won';
  return (
    <Dialog
      title={won ? '完成！' : '本局失败'}
      testId="result"
      onScrim={resultDone}
      actions={
        <>
          <button class="btn primary" onClick={resultDone} data-testid="result-done">
            返回首页
          </button>
        </>
      }
    >
      <div class="result">
        <div class="muted">
          {MODE_NAMES[e.mode]} · {LEVEL_NAMES[e.level]}
        </div>
        <div class="big" data-testid="result-time">
          {fmtTime(e.timeMs)}
        </div>
        {won && r.newRecord && (
          <span class="record" data-testid="new-record">
            新纪录！
          </span>
        )}
        {!won && <p class="small">对照答案判错已达 3 次（可在设置中关闭“错 3 次即失败”）。</p>}
        <dl>
          <div>
            <dt>提示</dt>
            <dd>{e.hints}</dd>
          </div>
          <div>
            <dt>错误</dt>
            <dd>{e.errors}</dd>
          </div>
          <div>
            <dt>难度分</dt>
            <dd>{e.score}</dd>
          </div>
          <div>
            <dt>{won && r.prevBest != null ? '之前最佳' : '辅助'}</dt>
            <dd>{won && r.prevBest != null ? fmtTime(r.prevBest) : e.assists}</dd>
          </div>
        </dl>
      </div>
    </Dialog>
  );
}

// ---------------- 设置 ----------------
export function SettingsLayer() {
  const a = useApp();
  const s = a.settings;
  const row = (label: string, desc: string | null, control: preact.JSX.Element) => (
    <div class="set-row">
      <div class="sr-label">
        {label}
        {desc && <span class="sr-desc">{desc}</span>}
      </div>
      {control}
    </div>
  );
  const pool = a.pool;
  return (
    <FullPage title="设置" testId="settings">
      <section class="card">
        <h2>外观</h2>
        {row(
          '主题',
          null,
          <Seg
            value={s.theme}
            options={[
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
              { value: 'system', label: '跟随系统' },
            ]}
            onChange={(v) => updateSettings({ theme: v })}
            testId="set-theme"
          />,
        )}
        {row('显示计时器', null, <Switch checked={s.showTimer} onChange={(v) => updateSettings({ showTimer: v })} label="显示计时器" />)}
        {row('锯齿区域淡彩底色', null, <Switch checked={s.jigsawTint} onChange={(v) => updateSettings({ jigsawTint: v })} label="锯齿区域淡彩底色" />)}
      </section>
      <section class="card">
        <h2>高亮</h2>
        {row('所在行、列、宫与区域/笼', null, <Switch checked={s.hlUnits} onChange={(v) => updateSettings({ hlUnits: v })} label="高亮相关单元" />)}
        {row('相同数字', null, <Switch checked={s.hlSameDigit} onChange={(v) => updateSettings({ hlSameDigit: v })} label="高亮相同数字" />)}
        {row('含该数字的笔记', null, <Switch checked={s.hlNotes} onChange={(v) => updateSettings({ hlNotes: v })} label="高亮笔记" />)}
      </section>
      <section class="card">
        <h2>查错与笔记</h2>
        {row(
          '查错模式',
          s.errorMode === 'off' ? '不做任何提示' : s.errorMode === 'conflict' ? '只标出与规则冲突的数字，不泄露答案' : '对照答案即时判错，并计错误次数',
          <Seg
            value={s.errorMode}
            options={[
              { value: 'off', label: '关闭' },
              { value: 'conflict', label: '规则冲突' },
              { value: 'answer', label: '对照答案' },
            ]}
            onChange={(v) => updateSettings({ errorMode: v })}
            testId="set-error"
          />,
        )}
        {s.errorMode === 'answer' &&
          row('错 3 次即失败', null, <Switch checked={s.threeStrikes} onChange={(v) => updateSettings({ threeStrikes: v })} label="错 3 次即失败" testId="set-3strikes" />)}
        {row('填数后自动清除相关笔记', null, <Switch checked={s.autoClearNotes} onChange={(v) => updateSettings({ autoClearNotes: v })} label="自动清笔记" />)}
        {row('杀手组合助手', '选中格时显示所在笼的全部组合（计为辅助）', <Switch checked={s.comboHelper} onChange={(v) => updateSettings({ comboHelper: v })} label="杀手组合助手" />)}
      </section>
      <section class="card">
        <h2>声音{features.vibrate ? '与震动' : ''}</h2>
        {row(
          '音效',
          null,
          <Switch
            checked={s.sound}
            onChange={(v) => {
              updateSettings({ sound: v });
              if (v) {
                sound.unlock();
                sound.play('fill', 5);
              }
            }}
            label="音效"
            testId="set-sound"
          />,
        )}
        {row(
          '音量',
          null,
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            aria-label="音量"
            onChange={(e) => {
              updateSettings({ volume: Number((e.currentTarget as HTMLInputElement).value) });
              sound.play('fill', 3);
            }}
          />,
        )}
        {features.vibrate &&
          row('震动', '按键与填数时短震', <Switch checked={s.vibrate} onChange={(v) => updateSettings({ vibrate: v })} label="震动" testId="set-vibrate" />)}
        <p class="small muted">iPhone 静音模式下网页音效不会播放，这是系统行为；安卓上音效跟随媒体音量。</p>
      </section>
      <section class="card" data-testid="pool-card">
        <h2>题池预生成</h2>
        <p class="small muted">
          App 在前台时会在后台线程预先生成题目（每模式每档 {POOL_PER_SLOT} 道），开新局可以立即开始；取出即作废，不会重复发放。
        </p>
        <p class="small digits" data-testid="pool-status">
          {pool.running && pool.mode
            ? `正在生成：${MODE_NAMES[pool.mode]} · ${LEVEL_NAMES[pool.level!]}（已完成 ${pool.done}/${pool.total}）`
            : `已预备 ${Object.values(a.poolCounts).reduce((x, y) => x + y, 0)} 道${isPoolStopped() ? '（已暂停）' : ''}`}
        </p>
        {pool.running ? (
          <button class="btn" onClick={stopPoolFilling} data-testid="pool-cancel">
            取消预生成
          </button>
        ) : (
          isPoolStopped() && (
            <button class="btn" onClick={resumePoolFilling}>
              继续预生成
            </button>
          )
        )}
      </section>
      <section class="card">
        <h2>关于</h2>
        <p class="small muted">版本 v{__APP_VERSION__}。全部题目在本机实时生成、评级与提示，不联网。</p>
      </section>
    </FullPage>
  );
}

export function LevelsAll(): Level[] {
  return LEVELS;
}

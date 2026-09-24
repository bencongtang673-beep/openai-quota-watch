import { useEffect, useState } from 'preact/hooks';
import { LEVEL_NAMES, MODE_NAMES } from '../../engine/types';
import { progressPct } from '../../game/game';
import { isAndroid, isIOS, isInAppBrowser, isStandalone } from '../../platform/env';
import { canPromptInstall, onInstallAvailabilityChange, promptInstall } from '../../platform/install';
import { continueLast, setFlag } from '../actions';
import { IconBackup, IconBook, IconHistory, IconImport, IconInstall, IconList, IconPlay, IconPlus, IconStats, IconGear } from '../icons';
import { openLayer } from '../nav';
import { fmtAgo, fmtTime } from '../stats';
import { useApp } from '../store';

export function Home() {
  const app = useApp();
  const [installable, setInstallable] = useState(canPromptInstall());
  useEffect(() => onInstallAvailabilityChange(() => setInstallable(canPromptInstall())), []);
  const last = app.games[0];
  const standalone = isStandalone();
  const showSafariHint = isIOS && !standalone && !isInAppBrowser && !app.flags['hint:safari'];

  return (
    <div class="screen" data-testid="home">
      <div class="page">
        <header class="home-head">
          <h1>数独</h1>
          <p class="sub">经典 · 对角线 · 锯齿 · 杀手 · 武士</p>
        </header>

        {isInAppBrowser && (
          <section class="card warn-card" data-testid="inapp-hint">
            <strong>请点右上角在浏览器中打开</strong>
            <p class="small">微信 / QQ 内置浏览器无法可靠地离线保存进度。点右上角「···」，选择「在浏览器中打开」。</p>
          </section>
        )}

        {showSafariHint && (
          <section class="card warn-card" data-testid="safari-hint">
            <strong>Safari 会清除长期未访问网站的数据，添加到主屏幕后才能长期保存进度</strong>
            <p class="small">步骤：点 Safari 的「分享」按钮 → 选择「添加到主屏幕」→ 点「添加」，以后从主屏幕图标打开。</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button class="btn" onClick={() => openLayer({ type: 'install' })}>
                看图文步骤
              </button>
              <button class="btn ghost" onClick={() => setFlag('hint:safari')} data-testid="safari-hint-dismiss">
                知道了
              </button>
            </div>
          </section>
        )}

        {app.dbError && (
          <section class="card warn-card" data-testid="db-error">
            <strong>无法使用本地存储</strong>
            <p class="small">
              {app.dbError}。可能处于无痕/隐私浏览模式，进度将无法保存。请退出无痕模式或换用 Safari / Chrome。
            </p>
          </section>
        )}

        {last && (
          <section class="card continue-card" data-testid="continue-card">
            <div class="info">
              <div class="rc-title" style={{ fontWeight: 600 }}>
                继续上一局
              </div>
              <div class="muted small">
                {MODE_NAMES[last.puzzle.mode]} · {LEVEL_NAMES[last.puzzle.level]} · 进度 {progressPct(last)}% · 用时{' '}
                <span class="digits">{fmtTime(last.elapsedMs)}</span> · {fmtAgo(last.updatedAt)}
              </div>
            </div>
            <button class="btn primary" onClick={continueLast} data-testid="continue-last">
              <IconPlay size={20} /> 继续
            </button>
          </section>
        )}

        <div class="menu-list">
          <button class="menu-item" onClick={() => openLayer({ type: 'newgame' })} data-testid="new-game">
            <span class="mi-icon">
              <IconPlus />
            </span>
            <span class="mi-text">
              新游戏
              <span class="mi-sub">选择模式与难度，本地实时出题</span>
            </span>
          </button>
          <button class="menu-item" onClick={() => openLayer({ type: 'unfinished' })} data-testid="open-unfinished">
            <span class="mi-icon">
              <IconList />
            </span>
            <span class="mi-text">
              未完成的局
              <span class="mi-sub">所有残局都会保留，直到完成或手动放弃</span>
            </span>
            {app.games.length > 0 && <span class="badge digits">{app.games.length}</span>}
          </button>
          <div class="grid-2">
            <button class="menu-item" onClick={() => openLayer({ type: 'history' })} data-testid="open-history">
              <span class="mi-icon">
                <IconHistory />
              </span>
              <span class="mi-text">历史记录</span>
            </button>
            <button class="menu-item" onClick={() => openLayer({ type: 'stats' })} data-testid="open-stats">
              <span class="mi-icon">
                <IconStats />
              </span>
              <span class="mi-text">统计</span>
            </button>
            <button class="menu-item" onClick={() => openLayer({ type: 'import' })} data-testid="open-import">
              <span class="mi-icon">
                <IconImport />
              </span>
              <span class="mi-text">导入题目</span>
            </button>
            <button class="menu-item" onClick={() => openLayer({ type: 'backup' })} data-testid="open-backup">
              <span class="mi-icon">
                <IconBackup />
              </span>
              <span class="mi-text">备份</span>
            </button>
            <button class="menu-item" onClick={() => openLayer({ type: 'help' })} data-testid="open-help">
              <span class="mi-icon">
                <IconBook />
              </span>
              <span class="mi-text">游玩说明</span>
            </button>
            <button class="menu-item" onClick={() => openLayer({ type: 'settings' })} data-testid="open-settings">
              <span class="mi-icon">
                <IconGear />
              </span>
              <span class="mi-text">设置</span>
            </button>
          </div>
          {!standalone && (installable || isIOS || isAndroid) && (
            <button
              class="menu-item"
              onClick={() => (installable ? promptInstall() : openLayer({ type: 'install' }))}
              data-testid="install-btn"
            >
              <span class="mi-icon">
                <IconInstall />
              </span>
              <span class="mi-text">
                {installable ? '安装' : '安装到主屏幕'}
                <span class="mi-sub">{installable ? '安装后可离线使用，像 App 一样打开' : '查看图文步骤'}</span>
              </span>
            </button>
          )}
        </div>
        <p class="muted small" style={{ textAlign: 'center', marginTop: '20px' }}>
          全部题目在本机实时生成，完全离线可玩 ·{' '}
          <span data-testid="app-version">
            v{__APP_VERSION__}
            {__BUILD_TAG__ ? '-' + __BUILD_TAG__ : ''}
          </span>
        </p>
      </div>
    </div>
  );
}

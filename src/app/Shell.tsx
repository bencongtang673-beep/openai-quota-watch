import { useEffect, useState } from 'preact/hooks';
import { canPromptInstall, onInstallAvailabilityChange, promptInstall } from '../platform/install';
import { isAndroid, isIOS, isIOSNonSafari, isInAppBrowser, isStandalone } from '../platform/env';
import { consumeJustUpdated, getSwVersion } from '../platform/sw-register';

// M0 空壳页：用于在两台手机上先验证“安装到主屏幕”和“飞行模式离线打开”。
export function Shell() {
  const [installable, setInstallable] = useState(canPromptInstall());
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [swVersion, setSwVersion] = useState<string | null>(null);
  const [updated] = useState(() => consumeJustUpdated());
  const [showIosGuide, setShowIosGuide] = useState(false);
  const standalone = isStandalone();

  useEffect(() => onInstallAvailabilityChange(() => setInstallable(canPromptInstall())), []);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    let alive = true;
    const poll = () =>
      getSwVersion().then((v) => {
        if (alive) setSwVersion(v);
      });
    poll();
    navigator.serviceWorker?.addEventListener?.('controllerchange', poll);
    return () => {
      alive = false;
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <main class="shell">
      <header class="shell-head">
        <div class="logo" aria-hidden="true">
          <span class="digits">9</span>
        </div>
        <h1>数独</h1>
        <p class="sub">经典 · 对角线 · 锯齿 · 杀手 · 武士</p>
      </header>

      {updated && <div class="toast" role="status">已更新到新版本</div>}

      {isInAppBrowser && (
        <section class="card warn" data-testid="inapp-hint">
          <strong>请点右上角在浏览器中打开</strong>
          <p>微信 / QQ 内置浏览器无法离线保存进度。点右上角「···」，选择「在浏览器中打开」。</p>
        </section>
      )}

      <section class="card">
        <h2>当前状态</h2>
        <ul class="status" data-testid="status">
          <li>
            网络：<b data-testid="net">{online ? '在线' : '离线'}</b>
          </li>
          <li>
            离线缓存：<b data-testid="sw">{swVersion ? `已就绪（${swVersion}）` : '准备中…'}</b>
          </li>
          <li>
            运行方式：<b data-testid="mode">{standalone ? '主屏幕 App' : '浏览器标签页'}</b>
          </li>
        </ul>
        <p class="note">
          这是 M0 阶段的空壳页，用来先验证安装和离线。游戏本体将在后续版本加入，安装后会自动更新，不需要重新安装。
        </p>
      </section>

      {!standalone && (
        <section class="card">
          <h2>安装到主屏幕</h2>
          {installable && (
            <button class="btn primary" data-testid="install-btn" onClick={() => promptInstall()}>
              安装
            </button>
          )}
          {isIOS && (
            <>
              {isIOSNonSafari && <p class="note">请先用 Safari 打开本页，再添加到主屏幕。</p>}
              <button class="btn" onClick={() => setShowIosGuide((v) => !v)} aria-expanded={showIosGuide}>
                {showIosGuide ? '收起 iPhone 安装步骤' : '查看 iPhone 安装步骤'}
              </button>
              {showIosGuide && <IosSteps />}
            </>
          )}
          {isAndroid && !installable && (
            <p class="note">
              如果没有出现「安装」按钮：在 Chrome 右上角「⋮」菜单中选择「添加到主屏幕」或「安装应用」。国产浏览器的“添加到桌面”表现不一，推荐使用 Chrome 安装。
            </p>
          )}
          {!isIOS && !isAndroid && !installable && <p class="note">请在手机上打开本页进行安装。</p>}
        </section>
      )}

      <section class="card">
        <h2>验证离线</h2>
        <ol class="steps">
          <li>先联网打开一次本页，等「离线缓存」显示“已就绪”。</li>
          <li>安装到主屏幕。</li>
          <li>打开飞行模式，从主屏幕图标启动，应能正常打开本页。</li>
        </ol>
      </section>

      <footer class="foot digits">v{__APP_VERSION__}</footer>
    </main>
  );
}

function IosSteps() {
  return (
    <ol class="steps ios-steps" data-testid="ios-steps">
      <li>
        <span class="step-icon" aria-hidden="true">
          <ShareIcon />
        </span>
        点 Safari 底部（或地址栏旁）的「分享」按钮。
      </li>
      <li>
        <span class="step-icon" aria-hidden="true">
          <AddIcon />
        </span>
        在菜单中向下滑，选择「添加到主屏幕」。
      </li>
      <li>
        <span class="step-icon" aria-hidden="true">
          <span class="digits">✓</span>
        </span>
        点右上角「添加」，之后从主屏幕图标打开。
      </li>
    </ol>
  );
}

export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11v8a2 2 0 002 2h8a2 2 0 002-2v-8" />
    </svg>
  );
}

export function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

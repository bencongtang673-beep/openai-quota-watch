import { render } from 'preact';
import './app/base.css';
import './app/app.css';
import { App } from './app/App';
import { initApp, installGameLifecycle, onLeaveGame } from './app/actions';
import { installNav } from './app/nav';
import { installPoolLifecycle } from './app/pool';
import { app } from './app/store';
import { installAudioLifecycle } from './platform/audio';
import { installGlobalGuards } from './platform/guards';
import { initInstallPrompt } from './platform/install';
import { registerServiceWorker } from './platform/sw-register';

installGlobalGuards();
initInstallPrompt();
installAudioLifecycle();
installNav(onLeaveGame);
installGameLifecycle();
render(<App />, document.getElementById('app')!);
initApp().then(() => {
  installPoolLifecycle();
});
// 只有不在对局中时才允许切换到新版本（对局中绝不强制刷新）
registerServiceWorker(() => app.screen !== 'game' && app.layers.length === 0);

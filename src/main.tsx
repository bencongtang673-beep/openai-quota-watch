import { render } from 'preact';
import './app/base.css';
import './app/shell.css';
import { Shell } from './app/Shell';
import { initInstallPrompt } from './platform/install';
import { registerServiceWorker } from './platform/sw-register';
import { requestPersistentStorage } from './platform/env';
import { installGlobalGuards } from './platform/guards';

installGlobalGuards();
initInstallPrompt();
render(<Shell />, document.getElementById('app')!);
// M0 空壳没有对局，任何时刻都可安全切换新版本
registerServiceWorker(() => true);
requestPersistentStorage();

import { useEffect } from 'preact/hooks';
import { useApp, type Layer } from './store';
import { Home } from './screens/Home';
import { GameScreen } from './screens/GameScreen';
import {
  BackupLayer,
  ConfirmLayer,
  GeneratingLayer,
  HistoryLayer,
  ImportLayer,
  MenuLayer,
  NewGameLayer,
  ResultLayer,
  SettingsLayer,
  ShareLayer,
  StatsLayer,
  UnfinishedLayer,
} from './screens/layers';
import { HelpLayer, InstallLayer, RulesLayer } from './screens/Help';
import { OverviewLayer } from './screens/Overview';
import { consumeJustUpdated } from '../platform/sw-register';
import { toast } from './store';

function renderLayer(l: Layer, i: number) {
  switch (l.type) {
    case 'newgame':
      return <NewGameLayer key={i} layer={l} />;
    case 'generating':
      return <GeneratingLayer key={i} />;
    case 'unfinished':
      return <UnfinishedLayer key={i} />;
    case 'history':
      return <HistoryLayer key={i} />;
    case 'stats':
      return <StatsLayer key={i} />;
    case 'settings':
      return <SettingsLayer key={i} />;
    case 'help':
      return <HelpLayer key={i} layer={l} />;
    case 'backup':
      return <BackupLayer key={i} />;
    case 'import':
      return <ImportLayer key={i} />;
    case 'menu':
      return <MenuLayer key={i} />;
    case 'rules':
      return <RulesLayer key={i} layer={l} />;
    case 'confirm':
      return <ConfirmLayer key={i} layer={l} />;
    case 'result':
      return <ResultLayer key={i} />;
    case 'install':
      return <InstallLayer key={i} />;
    case 'share':
      return <ShareLayer key={i} layer={l} />;
    case 'overview':
      return <OverviewLayer key={i} />;
    case 'pool':
      return <SettingsLayer key={i} />;
  }
}

export function App() {
  const app = useApp();
  useEffect(() => {
    if (consumeJustUpdated()) toast('已更新到新版本', 3000);
  }, []);
  if (!app.ready) {
    return (
      <div class="app">
        <div class="screen" style={{ display: 'grid', placeItems: 'center' }}>
          <div class="muted">正在加载…</div>
        </div>
      </div>
    );
  }
  return (
    <div class="app">
      {app.screen === 'game' && app.current ? <GameScreen /> : <Home />}
      {app.layers.map(renderLayer)}
      <div class="toast-host" aria-live="polite">
        {app.toasts.map((t) => (
          <div class="toast" key={t.id} data-testid="toast">
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

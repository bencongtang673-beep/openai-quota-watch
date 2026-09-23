import { describe, expect, it } from 'vitest';
import { buildManifest } from '../../scripts/pwa-plugin';

describe('manifest 子路径适配', () => {
  it('start_url / scope / id / 图标全部位于子路径下', () => {
    const m = buildManifest('/openai-quota-watch/');
    expect(m.start_url).toBe('/openai-quota-watch/');
    expect(m.scope).toBe('/openai-quota-watch/');
    expect(m.id).toBe('/openai-quota-watch/');
    expect(m.display).toBe('standalone');
    for (const i of m.icons) expect(i.src.startsWith('/openai-quota-watch/icons/')).toBe(true);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });
  it('根路径部署同样成立', () => {
    const m = buildManifest('/');
    expect(m.start_url).toBe('/');
    expect(m.icons[0].src).toBe('/icons/icon-192.png');
  });
});

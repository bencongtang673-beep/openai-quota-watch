// Web Audio 实时合成音效（不使用任何音频文件）。
// - 主音量 → 压缩器 → 输出，防爆音；限制同时发声数，快速连点不叠爆。
// - 首次触摸时创建/恢复 AudioContext；从后台切回自动恢复。
// - 支持时设置 navigator.audioSession.type = "ambient"，不打断用户正在听的音乐。

export type SoundName =
  | 'fill'
  | 'note'
  | 'erase'
  | 'undo'
  | 'redo'
  | 'error'
  | 'unit'
  | 'digitDone'
  | 'hint'
  | 'win';

// 五声音阶（C 大调五声）：数字 1–9
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];
const MAX_VOICES = 8;

type Ctx = AudioContext;

class SoundEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private voices: { stop: (t: number) => void; end: number }[] = [];
  enabled = true;
  volume = 0.7;

  /** 在用户手势中调用：创建或恢复 AudioContext */
  unlock() {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        const nav = navigator as Navigator & { audioSession?: { type: string } };
        if (nav.audioSession) nav.audioSession.type = 'ambient';
      } catch {
        /* 不支持时忽略 */
      }
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => undefined);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  get available() {
    return !!this.ctx;
  }

  play(name: SoundName, arg = 0) {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    this.gc(t);
    switch (name) {
      case 'fill':
        this.marimba(PENTA[(arg || 1) - 1], t, 0.32, 0.9);
        break;
      case 'note':
        this.tone(PENTA[(arg || 1) - 1] * 2, t, 0.09, 0.22, 'sine', 0.002);
        break;
      case 'erase':
        this.sweep(620, 240, t, 0.13, 0.35);
        break;
      case 'undo':
        this.tone(880, t, 0.05, 0.22, 'triangle', 0.002);
        this.tone(660, t + 0.045, 0.06, 0.2, 'triangle', 0.002);
        break;
      case 'redo':
        this.tone(660, t, 0.05, 0.2, 'triangle', 0.002);
        this.tone(880, t + 0.045, 0.06, 0.22, 'triangle', 0.002);
        break;
      case 'error':
        this.tone(233.08, t, 0.14, 0.45, 'sine', 0.01, 900);
        this.tone(196.0, t + 0.12, 0.2, 0.45, 'sine', 0.01, 900);
        break;
      case 'unit':
        [1046.5, 1318.51, 1567.98].forEach((f, i) => this.marimba(f, t + i * 0.075, 0.28, 0.55));
        break;
      case 'digitDone':
        this.bell(1567.98, t, 0.9, 0.45);
        break;
      case 'hint':
        this.bell(880, t, 1.0, 0.35, 0.03);
        this.bell(1318.51, t + 0.02, 0.9, 0.18, 0.03);
        break;
      case 'win': {
        const seq = [523.25, 659.25, 783.99, 1046.5];
        seq.forEach((f, i) => this.marimba(f, t + i * 0.14, 0.35, 0.8));
        const tc = t + seq.length * 0.14;
        [783.99, 1046.5, 1318.51].forEach((f) => this.bell(f, tc, 0.95, 0.3, 0.01));
        break;
      }
    }
  }

  private gc(now: number) {
    this.voices = this.voices.filter((v) => v.end > now);
    while (this.voices.length >= MAX_VOICES) {
      const v = this.voices.shift()!;
      v.stop(now);
    }
  }

  private envGain(t: number, attack: number, dur: number, peak: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master!);
    return g;
  }

  private track(nodes: OscillatorNode[], gain: GainNode, end: number) {
    for (const o of nodes) o.stop(end + 0.02);
    this.voices.push({
      end,
      stop: (now) => {
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setTargetAtTime(0.0001, now, 0.01);
          for (const o of nodes) o.stop(now + 0.05);
        } catch {
          /* 已停止 */
        }
      },
    });
  }

  private tone(freq: number, t: number, dur: number, peak: number, type: OscillatorType, attack = 0.004, lowpass = 0) {
    const ctx = this.ctx!;
    const g = this.envGain(t, attack, dur, peak);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      o.connect(f);
      f.connect(g);
    } else o.connect(g);
    o.start(t);
    this.track([o], g, t + dur);
  }

  /** 马林巴：基音 + 快速衰减的 4 倍泛音 */
  private marimba(freq: number, t: number, dur: number, peak: number) {
    const ctx = this.ctx!;
    const g = this.envGain(t, 0.002, dur, peak * 0.5);
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(freq, t);
    o1.connect(g);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(peak * 0.18, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    g2.connect(g);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 3.98, t);
    o2.connect(g2);
    o1.start(t);
    o2.start(t);
    this.track([o1, o2], g, t + dur);
  }

  /** 铃声：基音 + 非谐和泛音，长衰减 */
  private bell(freq: number, t: number, dur: number, peak: number, attack = 0.002) {
    const ctx = this.ctx!;
    const g = this.envGain(t, attack, dur, peak * 0.5);
    const os: OscillatorNode[] = [];
    [
      [1, 1],
      [2.76, 0.35],
      [5.4, 0.12],
    ].forEach(([mul, amp]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * mul, t);
      const gg = ctx.createGain();
      gg.gain.value = amp;
      o.connect(gg);
      gg.connect(g);
      o.start(t);
      os.push(o);
    });
    this.track(os, g, t + dur);
  }

  private sweep(from: number, to: number, t: number, dur: number, peak: number) {
    const ctx = this.ctx!;
    const g = this.envGain(t, 0.004, dur, peak * 0.5);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    o.connect(g);
    o.start(t);
    this.track([o], g, t + dur);
  }
}

export const sound = new SoundEngine();

let installed = false;
/** 首次触摸时解锁音频；页面隐藏时挂起、回到前台恢复 */
export function installAudioLifecycle() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const unlock = () => sound.unlock();
  document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  document.addEventListener('touchend', unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sound.resume();
    else sound.suspend();
  });
}

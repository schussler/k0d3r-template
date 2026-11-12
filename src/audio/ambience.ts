import type { SectorId } from '../level/sectors';
import { type AudioEngine, gain, noise, tone } from './engine';

/**
 * Ambiente de cada setor: uma cama contínua (ruído filtrado e zumbidos) mais eventos aleatórios (estalos, gotas,
 * faíscas), e a sirene do laboratório, que acompanha o pulso da luz vermelha.
 */
interface Bed {
  stop(): void;
}

interface Profile {
  /** Cama contínua: tipo de oscilador, frequência e nível de cada camada. */
  readonly layers: readonly { type: OscillatorType; freq: number; level: number; filter: number }[];
  readonly airFreq: number;
  readonly airLevel: number;
  /** Eventos aleatórios por segundo e quais sons sortear. */
  readonly eventRate: number;
  readonly events: readonly ('clank' | 'drip' | 'zap' | 'creak' | 'whistle')[];
}

const PROFILES: Readonly<Record<SectorId, Profile>> = {
  hangar: {
    layers: [{ type: 'sawtooth', freq: 55, level: 0.05, filter: 220 }, { type: 'sine', freq: 82.4, level: 0.06, filter: 160 }],
    airFreq: 400, airLevel: 0.05, eventRate: 0.16, events: ['clank', 'creak'],
  },
  labs: {
    layers: [{ type: 'sawtooth', freq: 100, level: 0.04, filter: 500 }, { type: 'square', freq: 50, level: 0.02, filter: 300 }],
    airFreq: 1200, airLevel: 0.035, eventRate: 0.35, events: ['zap', 'clank'],
  },
  greenhouse: {
    layers: [{ type: 'sine', freq: 130.8, level: 0.03, filter: 400 }, { type: 'sine', freq: 196, level: 0.02, filter: 500 }],
    airFreq: 700, airLevel: 0.09, eventRate: 0.55, events: ['drip', 'whistle'],
  },
  core: {
    layers: [{ type: 'sawtooth', freq: 41.2, level: 0.09, filter: 180 }, { type: 'sine', freq: 61.7, level: 0.07, filter: 140 }],
    airFreq: 300, airLevel: 0.04, eventRate: 0.25, events: ['clank', 'zap'],
  },
};

export class Ambience {
  private bed: Bed | null = null;
  private profile: Profile = PROFILES.hangar;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private siren: { setLevel(l: number): void; stop(): void } | null = null;
  private sector: SectorId = 'hangar';
  private generation = 0;

  constructor(private readonly a: AudioEngine) {}

  /** Troca o ambiente: a cama anterior some e a nova entra. Sem áudio liberado, só guarda o setor. */
  setSector(id: SectorId): void {
    this.sector = id;
    this.profile = PROFILES[id];
    if (!this.a.ctx) return;
    this.restart();
  }

  /** Chamado quando o áudio é liberado pelo primeiro clique. */
  resume(): void {
    if (this.a.ready && !this.bed) this.restart();
  }

  private restart(): void {
    this.stopAll();
    if (!this.a.ready || !this.a.ctx) return;
    this.generation++;
    this.bed = this.buildBed(this.profile);
    if (this.sector === 'labs') this.siren = this.buildSiren();
    this.scheduleEvent(this.generation);
  }

  private stopAll(): void {
    this.bed?.stop();
    this.bed = null;
    this.siren?.stop();
    this.siren = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  stop(): void {
    this.generation++;
    this.stopAll();
  }

  /** Sirene do laboratório: o volume segue o pulso da luz (0 a 1). */
  setAlarm(pulse: number): void {
    this.siren?.setLevel(pulse);
  }

  private buildBed(p: Profile): Bed {
    const ctx = this.a.ctx as AudioContext;
    const out = gain(ctx, 0, this.a.ambient);
    out.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    const nodes: (OscillatorNode | AudioBufferSourceNode)[] = [];
    for (const l of p.layers) {
      const osc = ctx.createOscillator();
      osc.type = l.type;
      osc.frequency.value = l.freq;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.1;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = l.freq * 0.01;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = l.filter;
      const g = gain(ctx, l.level, out);
      osc.connect(f);
      f.connect(g);
      osc.start();
      lfo.start();
      nodes.push(osc, lfo);
    }
    // Ar em movimento: ruído em laço, filtrado, com a frequência varrida bem devagar.
    const air = ctx.createBufferSource();
    air.buffer = this.a.noise;
    air.loop = true;
    const af = ctx.createBiquadFilter();
    af.type = 'bandpass';
    af.frequency.value = p.airFreq;
    af.Q.value = 0.6;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.05;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = p.airFreq * 0.35;
    sweep.connect(sweepGain);
    sweepGain.connect(af.frequency);
    air.connect(af);
    af.connect(gain(ctx, p.airLevel, out));
    air.start();
    sweep.start();
    nodes.push(air, sweep);
    return {
      stop: () => {
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        for (const n of nodes) n.stop(ctx.currentTime + 2);
      },
    };
  }

  private buildSiren(): { setLevel(l: number): void; stop(): void } {
    const ctx = this.a.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 620;
    const mod = ctx.createOscillator();
    mod.frequency.value = 0.9;
    const modGain = ctx.createGain();
    modGain.gain.value = 170;
    mod.connect(modGain);
    modGain.connect(osc.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = gain(ctx, 0, this.a.ambient);
    osc.connect(f);
    f.connect(g);
    osc.start();
    mod.start();
    return {
      setLevel: (l) => g.gain.setTargetAtTime(0.02 + l * 0.07, ctx.currentTime, 0.05),
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        osc.stop(ctx.currentTime + 1.5);
        mod.stop(ctx.currentTime + 1.5);
      },
    };
  }

  private scheduleEvent(generation: number): void {
    const wait = (0.4 + Math.random() * 1.6) / this.profile.eventRate;
    this.timer = setTimeout(() => {
      if (generation !== this.generation) return;
      try {
        this.playEvent();
      } catch (err) {
        console.warn('Evento de ambiente falhou; seguindo com o próximo.', err);
      } finally {
        this.scheduleEvent(generation);
      }
    }, wait * 1000);
  }

  private playEvent(): void {
    const kind = this.profile.events[Math.floor(Math.random() * this.profile.events.length)];
    const x = (Math.random() - 0.5) * 60;
    const z = (Math.random() - 0.5) * 60;
    const v = this.a.voiceAt(x, 2 + Math.random() * 4, z, 0, 0.6);
    if (!v || !kind) return;
    const n = this.a.noise;
    switch (kind) {
      case 'clank':
        noise(v, n, { filter: 'bandpass', freq: 900 + Math.random() * 1200, q: 4, gain: 0.35, decay: 0.12 });
        tone(v, { type: 'square', freq: 180 + Math.random() * 100, freqEnd: 90, gain: 0.08, decay: 0.2 });
        break;
      case 'creak':
        tone(v, { type: 'sawtooth', freq: 140, freqEnd: 90 + Math.random() * 60, gain: 0.08, attack: 0.15, decay: 0.9 });
        break;
      case 'zap':
        noise(v, n, { filter: 'highpass', freq: 3000, gain: 0.3, decay: 0.15 });
        tone(v, { type: 'sawtooth', freq: 1800, freqEnd: 300, gain: 0.08, decay: 0.12 });
        break;
      case 'drip':
        tone(v, { type: 'sine', freq: 1400 + Math.random() * 800, freqEnd: 700, gain: 0.18, decay: 0.12 });
        tone(v, { type: 'sine', freq: 900, freqEnd: 500, gain: 0.08, decay: 0.2, at: 0.16 });
        break;
      case 'whistle':
        tone(v, { type: 'sine', freq: 2200 + Math.random() * 600, freqEnd: 2600, gain: 0.04, attack: 0.5, decay: 0.9 });
        break;
    }
  }
}

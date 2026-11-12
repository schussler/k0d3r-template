import type { SectorId } from '../logic/flow';
import type { WeaponId } from '../logic/weapons';
import { Music } from './music';

export interface Pos {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

type Shape = OscillatorType;

/**
 * Áudio todo sintetizado com Web Audio (osciladores, ruído filtrado, envelopes): sem arquivo de som.
 * O contexto só nasce no primeiro gesto (clique em "Jogar"), regra dos navegadores.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambienceBus!: GainNode;
  private noise!: AudioBuffer;
  private ambienceNodes: AudioNode[] = [];
  private alarmGain: GainNode | null = null;
  private volume = 0.8;
  music: Music | null = null;

  get ready(): boolean {
    return this.ctx !== null;
  }

  get time(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Cria ou retoma o contexto; deve ser chamado dentro de um gesto da jogadora. */
  unlock(): void {
    try {
      if (!this.ctx) this.create();
      else if (this.ctx.state === 'suspended') void this.ctx.resume().catch((err: unknown) => console.warn('[kepler] áudio não retomou', err));
    } catch (err: unknown) {
      console.warn('[kepler] áudio indisponível; o jogo segue sem som', err);
      this.ctx = null;
    }
  }

  private create(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = this.bus(0.9);
    this.ambienceBus = this.bus(0.35);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let n = 0; n < data.length; n++) data[n] = Math.random() * 2 - 1;
    this.music = new Music(ctx, this.bus(0.32));
  }

  private bus(gain: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    return g;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const t = ctx.currentTime;
    l.positionX.setTargetAtTime(x, t, 0.02);
    l.positionY.setTargetAtTime(y, t, 0.02);
    l.positionZ.setTargetAtTime(z, t, 0.02);
    l.forwardX.setTargetAtTime(fx, t, 0.02);
    l.forwardY.setTargetAtTime(fy, t, 0.02);
    l.forwardZ.setTargetAtTime(fz, t, 0.02);
  }

  /** Saída para um som: direto no barramento, ou num panner posicional. */
  private out(pos?: Pos, gain = 1): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 3;
      p.rolloffFactor = 1.1;
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
      g.connect(p).connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  private tone(dest: AudioNode, shape: Shape, f0: number, f1: number, dur: number, vol: number, delay = 0, attack = 0.003): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = shape;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(
    dest: AudioNode,
    filter: BiquadFilterType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay = 0,
    q = 0.8,
  ): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  // ---------- Armas ----------

  shot(weapon: WeaponId): void {
    if (!this.ctx) return;
    const o = this.out();
    const v = 0.9 + Math.random() * 0.2;
    if (weapon === 'pistol') {
      this.burst(o, 'bandpass', 3200 * v, 900, 0.14, 0.9, 0, 0.7);
      this.tone(o, 'sine', 170 * v, 45, 0.12, 0.9);
      this.tone(o, 'square', 1400 * v, 300, 0.03, 0.25);
    } else if (weapon === 'rifle') {
      this.burst(o, 'highpass', 1800 * v, 600, 0.09, 0.75);
      this.burst(o, 'lowpass', 1400, 200, 0.12, 0.6);
      this.tone(o, 'sine', 130 * v, 40, 0.1, 0.8);
    } else {
      this.burst(o, 'lowpass', 2400, 120, 0.42, 1.2);
      this.burst(o, 'highpass', 4000, 1500, 0.06, 0.6);
      this.tone(o, 'sine', 95, 28, 0.38, 1.1);
      // Bomba da escopeta.
      this.burst(o, 'bandpass', 900, 600, 0.06, 0.45, 0.42, 3);
      this.burst(o, 'bandpass', 1300, 900, 0.05, 0.5, 0.56, 3);
    }
    if (Math.random() < 0.6) this.casing(0.32 + Math.random() * 0.2);
  }

  private casing(delay: number): void {
    const o = this.out(undefined, 0.18);
    const f = 3800 + Math.random() * 1600;
    this.tone(o, 'sine', f, f, 0.08, 0.6, delay);
    this.tone(o, 'sine', f * 1.3, f * 1.3, 0.05, 0.4, delay + 0.07);
  }

  dry(): void {
    if (!this.ctx) return;
    this.tone(this.out(), 'square', 2200, 1800, 0.025, 0.25);
  }

  reload(weapon: WeaponId): void {
    if (!this.ctx) return;
    const o = this.out(undefined, 0.55);
    const click = (at: number, f: number): void => this.burst(o, 'bandpass', f, f * 0.7, 0.05, 0.9, at, 4);
    if (weapon === 'shotgun') {
      for (let n = 0; n < 4; n++) click(0.3 + n * 0.38, 1100 + n * 40);
      click(1.9, 700);
      click(2.0, 1000);
    } else {
      const total = weapon === 'pistol' ? 1.1 : 1.7;
      click(0.15, 900);
      this.burst(o, 'bandpass', 500, 1200, 0.25, 0.25, 0.25, 1);
      click(total * 0.6, 1400);
      click(total * 0.85, 2000);
    }
  }

  switchWeapon(): void {
    if (!this.ctx) return;
    const o = this.out(undefined, 0.4);
    this.burst(o, 'bandpass', 600, 2400, 0.18, 0.6, 0, 1.2);
    this.burst(o, 'bandpass', 1600, 1200, 0.04, 0.8, 0.3, 4);
  }

  // ---------- Feedback de acerto ----------

  hit(kind: 'body' | 'head' | 'kill' | 'blocked'): void {
    if (!this.ctx) return;
    const o = this.out(undefined, 0.6);
    if (kind === 'body') {
      this.tone(o, 'square', 1900, 1500, 0.06, 0.35);
      this.burst(o, 'highpass', 5000, 3000, 0.04, 0.4);
    } else if (kind === 'head') {
      this.tone(o, 'sine', 2600, 2600, 0.32, 0.7);
      this.tone(o, 'sine', 3900, 3900, 0.22, 0.4, 0.01);
      this.tone(o, 'square', 1200, 900, 0.04, 0.3);
    } else if (kind === 'kill') {
      this.tone(o, 'sine', 1800, 1800, 0.12, 0.5);
      this.tone(o, 'sine', 2700, 2700, 0.25, 0.5, 0.07);
    } else {
      this.tone(o, 'sine', 3400, 1100, 0.18, 0.45);
      this.burst(o, 'bandpass', 2500, 1800, 0.1, 0.4, 0, 2);
    }
  }

  playerHurt(shieldOnly: boolean): void {
    if (!this.ctx) return;
    const o = this.out(undefined, 0.7);
    if (shieldOnly) {
      this.tone(o, 'sawtooth', 900, 260, 0.18, 0.25);
      this.burst(o, 'bandpass', 3000, 800, 0.15, 0.4, 0, 1.5);
    } else {
      this.tone(o, 'sine', 120, 50, 0.25, 0.9);
      this.burst(o, 'lowpass', 900, 150, 0.25, 0.8);
    }
  }

  shieldBreak(): void {
    if (!this.ctx) return;
    const o = this.out(undefined, 0.6);
    this.tone(o, 'triangle', 2400, 300, 0.4, 0.4);
    this.burst(o, 'highpass', 6000, 2000, 0.3, 0.5);
  }

  // ---------- Movimento ----------

  footstep(heavy = false): void {
    if (!this.ctx) return;
    const o = this.out(undefined, heavy ? 0.5 : 0.3);
    this.burst(o, 'lowpass', 500, 120, 0.09, 0.9);
    this.tone(o, 'sine', 1300 + Math.random() * 400, 1100, 0.04, 0.08);
  }

  land(): void {
    if (!this.ctx) return;
    const o = this.out(undefined, 0.6);
    this.burst(o, 'lowpass', 700, 100, 0.16, 1);
    this.tone(o, 'sine', 90, 40, 0.14, 0.6);
  }

  jump(): void {
    if (!this.ctx) return;
    this.burst(this.out(undefined, 0.25), 'bandpass', 400, 900, 0.12, 0.6, 0, 1);
  }

  // ---------- Mundo ----------

  pickup(kind: 'health' | 'ammo' | 'weapon'): void {
    if (!this.ctx) return;
    const o = this.out(undefined, 0.45);
    const base = kind === 'health' ? 660 : kind === 'ammo' ? 520 : 440;
    [0, 4, 7, 12].forEach((semi, n) => {
      const f = base * Math.pow(2, semi / 12);
      this.tone(o, kind === 'weapon' ? 'square' : 'triangle', f, f, 0.12, 0.35, n * 0.05);
    });
  }

  switchOn(pos: Pos): void {
    if (!this.ctx) return;
    const o = this.out(pos, 1.2);
    this.tone(o, 'square', 880, 880, 0.08, 0.3);
    this.tone(o, 'square', 1320, 1320, 0.12, 0.3, 0.1);
  }

  door(pos: Pos): void {
    if (!this.ctx) return;
    const o = this.out(pos, 1.6);
    this.burst(o, 'highpass', 2500, 600, 0.7, 0.5, 0.05);
    this.tone(o, 'sine', 70, 50, 0.5, 0.6, 0.05);
    this.burst(o, 'lowpass', 400, 80, 0.2, 0.9, 0.75);
  }

  ui(): void {
    if (!this.ctx) return;
    this.tone(this.out(undefined, 0.3), 'triangle', 980, 1320, 0.08, 0.4);
  }

  // ---------- Robôs ----------

  enemyHurt(pos: Pos): void {
    if (!this.ctx) return;
    const o = this.out(pos, 0.8);
    this.burst(o, 'bandpass', 3000, 1500, 0.08, 0.7, 0, 3);
    this.tone(o, 'square', 600 + Math.random() * 300, 300, 0.06, 0.2);
  }

  enemyDie(pos: Pos, big = false): void {
    if (!this.ctx) return;
    const o = this.out(pos, big ? 2.5 : 1.3);
    this.burst(o, 'lowpass', 3000, 80, big ? 1.4 : 0.6, 1.1);
    this.tone(o, 'sawtooth', 500, 40, big ? 1.2 : 0.5, 0.4);
    this.tone(o, 'sine', 80, 25, big ? 1 : 0.4, 1);
    for (let n = 0; n < 5; n++) this.burst(o, 'bandpass', 2000 + Math.random() * 3000, 800, 0.05, 0.5, 0.1 + Math.random() * 0.5, 5);
  }

  droneWarn(pos: Pos): void {
    if (!this.ctx) return;
    this.tone(this.out(pos, 1.1), 'sawtooth', 300, 1500, 0.65, 0.22, 0, 0.05);
  }

  droneDive(pos: Pos): void {
    if (!this.ctx) return;
    this.burst(this.out(pos, 1.2), 'bandpass', 600, 2400, 0.5, 0.7, 0, 1.5);
  }

  laserCharge(pos: Pos): void {
    if (!this.ctx) return;
    this.tone(this.out(pos, 0.9), 'sine', 400, 1800, 0.55, 0.25, 0, 0.05);
  }

  enemyShot(pos: Pos, heavy = false): void {
    if (!this.ctx) return;
    const o = this.out(pos, heavy ? 1.6 : 1.1);
    this.tone(o, 'square', heavy ? 700 : 1500, heavy ? 120 : 300, heavy ? 0.25 : 0.12, 0.4);
    this.burst(o, 'highpass', 3000, 1200, 0.08, 0.4);
  }

  bruteStep(pos: Pos): void {
    if (!this.ctx) return;
    const o = this.out(pos, 1.6);
    this.tone(o, 'sine', 70, 35, 0.25, 0.9);
    this.burst(o, 'lowpass', 300, 60, 0.2, 0.7);
  }

  roar(pos: Pos, big = false): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = this.out(pos, big ? 2.4 : 1.4);
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(big ? 55 : 90, t);
    osc.frequency.linearRampToValueAtTime(big ? 40 : 60, t + 1);
    lfo.frequency.value = 28;
    lfoGain.gain.value = 20;
    lfo.connect(lfoGain).connect(osc.frequency);
    f.type = 'lowpass';
    f.frequency.value = 900;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(f).connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 1.2);
    lfo.stop(t + 1.2);
    this.burst(o, 'bandpass', 800, 300, 1, 0.4, 0, 1);
  }

  punch(pos: Pos): void {
    if (!this.ctx) return;
    this.burst(this.out(pos, 1.3), 'bandpass', 300, 1400, 0.25, 0.8, 0, 1);
  }

  stomp(pos: Pos): void {
    if (!this.ctx) return;
    const o = this.out(pos, 3);
    this.tone(o, 'sine', 60, 22, 0.9, 1.2);
    this.burst(o, 'lowpass', 1200, 50, 0.9, 1.2);
  }

  laserBeam(pos: Pos, dur: number): void {
    if (!this.ctx) return;
    const o = this.out(pos, 1.2);
    this.tone(o, 'sawtooth', 180, 160, dur, 0.18, 0, 0.1);
    this.tone(o, 'sine', 2200, 2000, dur, 0.08, 0, 0.1);
  }

  // ---------- Ambiente ----------

  setAmbience(sector: SectorId | 'title'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.ambienceNodes.forEach((n) => {
      if (n instanceof AudioScheduledSourceNode) n.stop();
      n.disconnect();
    });
    this.ambienceNodes = [];
    this.alarmGain = null;
    const loopNoise = (filter: BiquadFilterType, freq: number, gain: number, q = 0.7): void => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filter;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(this.ambienceBus);
      src.start();
      this.ambienceNodes.push(src, f, g);
    };
    const drone = (freq: number, gain: number, shape: Shape = 'sine'): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = shape;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.ambienceBus);
      o.start();
      this.ambienceNodes.push(o, g);
      return o;
    };
    if (sector === 'title') {
      loopNoise('lowpass', 180, 0.5);
      drone(55, 0.12);
      drone(82.4, 0.06);
    } else if (sector === 'hangar') {
      loopNoise('lowpass', 220, 0.9);
      loopNoise('bandpass', 1800, 0.05, 2);
      drone(48, 0.1);
    } else if (sector === 'labs') {
      loopNoise('lowpass', 400, 0.35);
      drone(60, 0.07);
      drone(120, 0.03, 'triangle');
      this.startAlarm();
    } else if (sector === 'greenhouse') {
      loopNoise('bandpass', 900, 0.25, 0.5);
      loopNoise('highpass', 6000, 0.04);
      drone(98, 0.04, 'triangle');
    } else {
      loopNoise('lowpass', 140, 0.8);
      const a = drone(41, 0.16, 'sawtooth');
      const b = drone(41.6, 0.12, 'sawtooth');
      a.detune.value = -5;
      b.detune.value = 7;
    }
  }

  /** Sirene do laboratório: o volume pulsa no mesmo período da luz vermelha (ALARM_PERIOD). */
  private startAlarm(): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 620;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 1 / ALARM_PERIOD;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 260;
    sweep.connect(sweepGain).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.05;
    o.connect(g).connect(this.ambienceBus);
    o.start();
    sweep.start();
    this.alarmGain = g;
    this.ambienceNodes.push(o, sweep, sweepGain, g);
  }

  /** Abafa a sirene quando a jogadora está longe do laboratório principal (não usado fora do setor 2). */
  setAlarmLevel(level: number): void {
    if (this.ctx && this.alarmGain) this.alarmGain.gain.setTargetAtTime(0.05 * level, this.ctx.currentTime, 0.2);
  }

  update(dt: number, combatIntensity: number): void {
    this.music?.update(dt, combatIntensity);
  }
}

/** Período, em segundos, da luz e da sirene de alarme do laboratório. */
export const ALARM_PERIOD = 1.6;

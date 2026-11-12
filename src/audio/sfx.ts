import type { WeaponId } from '../rules/arsenal';
import { type AudioEngine, noise, tone } from './engine';

/** Biblioteca de efeitos. Cada arma tem um timbre próprio: estalo, corpo grave e cauda diferentes. */
const jitter = (base: number, amount = 0.06) => base * (1 + (Math.random() * 2 - 1) * amount);

export class Sfx {
  constructor(private readonly a: AudioEngine) {}

  fire(id: WeaponId): void {
    const v = this.a.voice(0, id === 'shotgun' ? 0.6 : 0.45);
    if (!v) return;
    const n = this.a.noise;
    if (id === 'pistol') {
      tone(v, { type: 'triangle', freq: jitter(210), freqEnd: 55, gain: 0.55, decay: 0.12 });
      noise(v, n, { filter: 'bandpass', freq: jitter(2600), freqEnd: 900, q: 0.7, gain: 0.95, decay: 0.1 });
      noise(v, n, { filter: 'highpass', freq: 6500, gain: 0.45, decay: 0.03 });
      tone(v, { type: 'square', freq: 3200, gain: 0.05, decay: 0.012, at: 0.004 });
    } else if (id === 'rifle') {
      tone(v, { type: 'sawtooth', freq: jitter(150, 0.1), freqEnd: 48, gain: 0.42, decay: 0.08 });
      noise(v, n, { filter: 'bandpass', freq: jitter(1700, 0.1), freqEnd: 700, q: 0.9, gain: 0.85, decay: 0.075 });
      noise(v, n, { filter: 'highpass', freq: 5200, gain: 0.35, decay: 0.022 });
      tone(v, { type: 'square', freq: 2300, gain: 0.04, decay: 0.01, at: 0.035 });
    } else {
      tone(v, { type: 'sine', freq: 95, freqEnd: 32, gain: 0.95, decay: 0.38 });
      tone(v, { type: 'sawtooth', freq: 70, freqEnd: 40, gain: 0.25, decay: 0.2 });
      noise(v, n, { filter: 'lowpass', freq: 2400, freqEnd: 300, gain: 1.1, decay: 0.32 });
      noise(v, n, { filter: 'bandpass', freq: 3600, q: 0.6, gain: 0.6, decay: 0.07 });
      this.pump(0.42);
    }
  }

  private pump(at: number): void {
    const v = this.a.voice(at, 0.2);
    if (!v) return;
    noise(v, this.a.noise, { filter: 'bandpass', freq: 1300, q: 2, gain: 0.35, decay: 0.05 });
    tone(v, { type: 'square', freq: 520, freqEnd: 300, gain: 0.08, decay: 0.03 });
    noise(v, this.a.noise, { filter: 'bandpass', freq: 1900, q: 2.5, gain: 0.4, decay: 0.05, at: 0.14 });
    tone(v, { type: 'square', freq: 760, freqEnd: 420, gain: 0.08, decay: 0.03, at: 0.14 });
  }

  dry(): void {
    const v = this.a.voice(0, 0.1);
    if (!v) return;
    tone(v, { type: 'square', freq: 2900, gain: 0.08, decay: 0.012 });
    noise(v, this.a.noise, { filter: 'bandpass', freq: 1500, q: 3, gain: 0.25, decay: 0.03 });
  }

  /** Sequência da recarga agendada de uma vez: tira o pente, põe o pente novo, puxa o ferrolho. */
  reloadStart(id: WeaponId, duration: number): void {
    if (id === 'shotgun') return;
    const steps = id === 'pistol' ? [0.12, 0.55, 0.85] : [0.2, 0.62, 0.86];
    const [out, inn, rack] = steps.map((s) => s * duration);
    this.clack(out ?? 0, 900, 0.3);
    this.clack(inn ?? 0, 1400, 0.45);
    this.clack(rack ?? 0, 2100, 0.4, true);
  }

  shell(): void {
    this.clack(0.06, 1200, 0.35);
    this.clack(0.2, 1800, 0.3, true);
  }

  draw(): void {
    const v = this.a.voice(0, 0.1);
    if (!v) return;
    noise(v, this.a.noise, { filter: 'bandpass', freq: 700, q: 0.6, gain: 0.18, attack: 0.03, decay: 0.12 });
    tone(v, { type: 'square', freq: 1900, freqEnd: 1300, gain: 0.05, decay: 0.03, at: 0.14 });
  }

  private clack(at: number, freq: number, level: number, double = false): void {
    const v = this.a.voice(at, 0.15);
    if (!v) return;
    noise(v, this.a.noise, { filter: 'bandpass', freq, q: 3, gain: level, decay: 0.045 });
    tone(v, { type: 'square', freq: freq * 0.5, freqEnd: freq * 0.3, gain: level * 0.15, decay: 0.03 });
    if (double) noise(v, this.a.noise, { filter: 'bandpass', freq: freq * 1.3, q: 3, gain: level * 0.8, decay: 0.04, at: 0.06 });
  }

  /** Marcador de acerto: estalo curto no corpo; na cabeça, um sino brilhante com batida grave. */
  hit(head: boolean): void {
    const v = this.a.voice(0, 0.05);
    if (!v) return;
    if (head) {
      tone(v, { type: 'sine', freq: 2350, gain: 0.32, decay: 0.32 });
      tone(v, { type: 'sine', freq: 3520, gain: 0.16, decay: 0.24 });
      tone(v, { type: 'triangle', freq: 180, freqEnd: 70, gain: 0.35, decay: 0.12 });
    } else {
      tone(v, { type: 'square', freq: 1650, gain: 0.07, decay: 0.035 });
      noise(v, this.a.noise, { filter: 'highpass', freq: 3500, gain: 0.2, decay: 0.03 });
    }
  }

  /** Bala batendo no escudo do brutamontes: "tim" metálico que avisa que não adianta. */
  blocked(x: number, y: number, z: number): void {
    const v = this.a.voiceAt(x, y, z, 0, 0.4);
    if (!v) return;
    tone(v, { type: 'triangle', freq: jitter(2700), gain: 0.4, decay: 0.28 });
    tone(v, { type: 'sine', freq: jitter(4100), gain: 0.2, decay: 0.2 });
    tone(v, { type: 'sine', freq: 3000, freqEnd: 1700, gain: 0.12, decay: 0.16, at: 0.02 });
  }

  impact(x: number, y: number, z: number, surface: string): void {
    const v = this.a.voiceAt(x, y, z, 0, 0.35);
    if (!v) return;
    if (surface === 'glass') {
      tone(v, { type: 'sine', freq: jitter(3800, 0.15), gain: 0.15, decay: 0.15 });
      noise(v, this.a.noise, { filter: 'highpass', freq: 5000, gain: 0.3, decay: 0.06 });
    } else if (surface === 'plant' || surface === 'crate') {
      noise(v, this.a.noise, { filter: 'lowpass', freq: 900, gain: 0.45, decay: 0.06 });
    } else {
      noise(v, this.a.noise, { filter: 'bandpass', freq: jitter(3600, 0.2), q: 1.2, gain: 0.45, decay: 0.05 });
      if (Math.random() < 0.25) tone(v, { type: 'sine', freq: jitter(3400, 0.2), freqEnd: 1500, gain: 0.08, decay: 0.18 });
    }
  }

  brass(x: number, y: number, z: number, heavy: boolean): void {
    const v = this.a.voiceAt(x, y, z, 0, 0.1);
    if (!v) return;
    const f = heavy ? jitter(1500, 0.2) : jitter(4800, 0.2);
    tone(v, { type: 'triangle', freq: f, gain: 0.12, decay: heavy ? 0.06 : 0.09 });
    tone(v, { type: 'sine', freq: f * 1.5, gain: 0.05, decay: 0.05 });
  }

  step(sprint: boolean): void {
    const v = this.a.voice(0, 0.05);
    if (!v) return;
    noise(v, this.a.noise, { filter: 'lowpass', freq: sprint ? 650 : 480, gain: sprint ? 0.28 : 0.18, decay: 0.07 });
    tone(v, { type: 'sine', freq: jitter(150, 0.1), freqEnd: 90, gain: 0.08, decay: 0.06 });
  }

  jump(): void {
    const v = this.a.voice(0, 0.05);
    if (!v) return;
    noise(v, this.a.noise, { filter: 'lowpass', freq: 600, gain: 0.2, decay: 0.08 });
  }

  land(strength: number): void {
    const v = this.a.voice(0, 0.15);
    if (!v) return;
    noise(v, this.a.noise, { filter: 'lowpass', freq: 400, gain: 0.25 + strength * 0.3, decay: 0.12 });
    tone(v, { type: 'sine', freq: 110, freqEnd: 50, gain: 0.2 + strength * 0.2, decay: 0.1 });
  }

  ui(): void {
    const v = this.a.voice(0, 0.1);
    if (!v) return;
    tone(v, { type: 'sine', freq: 880, freqEnd: 1320, gain: 0.12, decay: 0.08 });
  }
}

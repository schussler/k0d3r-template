import type { SectorId } from '../level/sectors';
import { type AudioEngine, noise, tone } from './engine';

/**
 * Música adaptativa sintetizada: um padrão de 16 passos tocado por um agendador com antecipação. A intensidade
 * (0 calmo, 1 combate) acelera o andamento e liga as camadas de arpejo, bumbo e chimbal.
 */
const LOOKAHEAD = 0.15;
const TICK_MS = 40;
const STEPS = 16;
const MAX_LAG = 0.5;

interface Mode {
  readonly root: number;
  readonly scale: readonly number[];
  readonly bassPattern: readonly number[];
  readonly bpmCalm: number;
  readonly bpmCombat: number;
}

// Semitons a partir da tônica; -1 em `bassPattern` é pausa, os demais indexam a escala.
const MODES: Readonly<Record<SectorId, Mode>> = {
  hangar: { root: 55, scale: [0, 2, 3, 5, 7, 8, 10], bassPattern: [0, -1, 0, -1, 2, -1, 0, -1, 4, -1, 0, -1, 3, -1, 2, -1], bpmCalm: 84, bpmCombat: 132 },
  labs: { root: 49, scale: [0, 1, 3, 5, 7, 8, 10], bassPattern: [0, 0, -1, 0, 1, -1, 0, -1, 0, 0, -1, 1, 0, -1, 4, -1], bpmCalm: 92, bpmCombat: 144 },
  greenhouse: { root: 58.27, scale: [0, 2, 4, 6, 7, 9, 11], bassPattern: [0, -1, -1, 0, -1, 2, -1, -1, 4, -1, -1, 2, -1, 0, -1, -1], bpmCalm: 76, bpmCombat: 126 },
  core: { root: 41.2, scale: [0, 2, 3, 5, 7, 8, 11], bassPattern: [0, 0, 0, -1, 0, 0, 2, -1, 0, 0, 0, -1, 3, 3, 2, -1], bpmCalm: 104, bpmCombat: 156 },
};

const freq = (root: number, semitones: number) => root * Math.pow(2, semitones / 12);

export class Music {
  private mode: Mode = MODES.hangar;
  private intensity = 0;
  private target = 0;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly a: AudioEngine) {}

  start(): void {
    if (this.running || !this.a.ctx) return;
    this.running = true;
    this.nextTime = this.a.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setSector(id: SectorId): void {
    this.mode = MODES[id];
    this.step = 0;
  }

  /** 0 calmo, 0.4 alerta, 1 combate. */
  setTarget(level: number): void {
    this.target = level;
  }

  /** Chamado a cada quadro: a intensidade sobe rápido e desce devagar. */
  update(dt: number): void {
    const rate = this.target > this.intensity ? 1.6 : 0.22;
    this.intensity += Math.max(-rate * dt, Math.min(rate * dt, this.target - this.intensity));
  }

  get level(): number {
    return this.intensity;
  }

  /** Uma falha no agendador para a música com um aviso, em vez de repetir o erro a cada 40 ms. */
  private tick(): void {
    try {
      this.schedule();
    } catch (err) {
      console.warn('Música parou por um erro; o jogo segue sem trilha.', err);
      this.stop();
    }
  }

  private schedule(): void {
    const ctx = this.a.ctx;
    if (!ctx || !this.running || !this.a.ready) return;
    // Aba em segundo plano ou contexto atrasado: recomeça do agora em vez de disparar os passos perdidos de uma vez.
    if (this.nextTime < ctx.currentTime - MAX_LAG) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime - ctx.currentTime);
      const bpm = this.mode.bpmCalm + (this.mode.bpmCombat - this.mode.bpmCalm) * this.intensity;
      this.nextTime += 60 / bpm / 4;
      this.step = (this.step + 1) % STEPS;
    }
  }

  private playStep(step: number, delay: number): void {
    const v = this.a.musicVoice(Math.max(0, delay));
    if (!v) return;
    const m = this.mode;
    const n = this.a.noise;
    const bassDegree = m.bassPattern[step] ?? -1;
    if (bassDegree >= 0) {
      const f = freq(m.root, m.scale[bassDegree % m.scale.length] ?? 0);
      tone(v, { type: 'sawtooth', freq: f, gain: 0.34, attack: 0.005, decay: 0.16 });
      tone(v, { type: 'square', freq: f * 2, gain: 0.05 + this.intensity * 0.05, attack: 0.005, decay: 0.09 });
    }
    if (step % 4 === 0) {
      tone(v, { type: 'sine', freq: 130, freqEnd: 42, gain: 0.5 * (0.5 + this.intensity * 0.5), attack: 0.002, decay: 0.2 });
    }
    // Pad: acorde longo no início de cada compasso, sempre ao fundo.
    if (step === 0) {
      [0, 2, 4].forEach((d) => tone(v, { type: 'triangle', freq: freq(m.root * 4, m.scale[d] ?? 0), gain: 0.05, attack: 0.5, decay: 2.2 }));
    }
    if (this.intensity > 0.25) {
      // Arpejo e chimbal entram com o alerta; o contratempo e o bumbo duplo, com o combate.
      const deg = [0, 2, 4, 2, 5, 4, 2, 1][step % 8] ?? 0;
      tone(v, { type: 'triangle', freq: freq(m.root * 8, m.scale[deg % m.scale.length] ?? 0), gain: 0.05 + this.intensity * 0.06, attack: 0.002, decay: 0.12 });
      if (step % 2 === 0) noise(v, n, { filter: 'highpass', freq: 7000, gain: 0.08 + this.intensity * 0.08, decay: 0.04 });
    }
    if (this.intensity > 0.6) {
      if (step % 4 === 2) tone(v, { type: 'sine', freq: 170, freqEnd: 60, gain: 0.35, attack: 0.002, decay: 0.14 });
      if (step % 4 === 2) noise(v, n, { filter: 'bandpass', freq: 1800, q: 1.2, gain: 0.25, decay: 0.1 });
    }
  }
}

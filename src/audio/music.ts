const LOOKAHEAD_S = 0.15;
const CALM_BPM = 84;
const COMBAT_BPM = 136;

/** Lá menor: graus em semitons a partir de A1 (55 Hz). */
const BASS_LINE = [0, 0, 7, 0, 3, 3, 10, 3, 5, 5, 0, 5, 7, 7, 3, 2];
const CHORDS: readonly (readonly number[])[] = [
  [0, 3, 7],
  [-4, 0, 3],
  [-7, -4, 0],
  [-2, 2, 5],
];
const ARP = [0, 7, 12, 15, 12, 7, 3, 10];

const hz = (semi: number, base = 55): number => base * Math.pow(2, semi / 12);

/**
 * Música gerada por sequenciador: calma na exploração; com robôs em combate entram bumbo, chimbal e
 * arpejo, e o andamento sobe. A intensidade muda devagar para a transição ser suave.
 */
export class Music {
  private intensity = 0;
  private step = 0;
  private nextTime = 0;
  private enabled = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: GainNode,
  ) {}

  start(): void {
    this.enabled = true;
    this.nextTime = this.ctx.currentTime + 0.1;
  }

  stop(): void {
    this.enabled = false;
  }

  get bpm(): number {
    return CALM_BPM + (COMBAT_BPM - CALM_BPM) * this.intensity;
  }

  update(dt: number, target: number): void {
    const rate = target > this.intensity ? 1.2 : 0.25;
    this.intensity += (target - this.intensity) * Math.min(1, rate * dt);
    if (!this.enabled) return;
    // Aba em segundo plano: não acumula notas atrasadas.
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD_S) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += 60 / this.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  private schedule(step: number, t: number): void {
    const i = this.intensity;
    const bar = Math.floor(step / 16) % CHORDS.length;
    const s16 = step % 16;
    if (s16 % 2 === 0) this.note('triangle', hz(BASS_LINE[(step / 2) % 16]! - 12 + (bar === 2 ? -2 : 0)), t, 0.22, 0.22 + 0.1 * i, 600);
    if (s16 === 0) CHORDS[bar]!.forEach((semi) => this.note('sawtooth', hz(semi, 220), t, 2.4, 0.035 * (1 - i * 0.5), 900));
    if (i > 0.25) {
      if (s16 % 4 === 0) this.kick(t, 0.7 * i);
      if (s16 % 2 === 1) this.hat(t, 0.12 * i);
      if (s16 === 4 || s16 === 12) this.snare(t, 0.35 * i);
    }
    if (i > 0.55) this.note('square', hz(ARP[step % ARP.length]! + CHORDS[bar]![0]!, 440), t, 0.09, 0.04 * i, 2500);
  }

  private note(shape: OscillatorType, freq: number, t: number, dur: number, vol: number, cutoff: number): void {
    const o = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = shape;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number, vol: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
  }

  private hat(t: number, vol: number): void {
    this.noiseHit(t, vol, 'highpass', 7000, 0.05);
  }

  private snare(t: number, vol: number): void {
    this.noiseHit(t, vol, 'bandpass', 1800, 0.14);
    this.note('triangle', 190, t, 0.1, vol * 0.5, 2000);
  }

  private noiseHit(t: number, vol: number, type: BiquadFilterType, freq: number, dur: number): void {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let n = 0; n < len; n++) d[n] = (Math.random() * 2 - 1) * (1 - n / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
  }
}

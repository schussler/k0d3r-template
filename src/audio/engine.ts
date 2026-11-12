/**
 * Motor de áudio: tudo sintetizado com Web Audio, sem arquivo. O contexto nasce no primeiro clique (política de
 * autoplay do navegador); antes disso os sons são ignorados em silêncio de propósito, o jogo roda mudo.
 */
export interface Voice {
  readonly ctx: AudioContext;
  readonly t: number;
  readonly out: AudioNode;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  ambient!: GainNode;
  reverbSend!: GainNode;
  private reverb!: ConvolverNode;
  noise!: AudioBuffer;
  private listenerReady = false;

  /** Chamado dentro de um gesto do usuário. */
  async unlock(): Promise<void> {
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('Áudio não pôde ser retomado; o jogo segue mudo até o próximo clique.', err);
      }
    }
  }

  async suspend(): Promise<void> {
    if (this.ctx?.state === 'running') await this.ctx.suspend();
  }

  private build(): void {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);
    this.master = gain(ctx, 0.85, comp);
    this.sfx = gain(ctx, 1, this.master);
    this.music = gain(ctx, 0.32, this.master);
    this.ambient = gain(ctx, 0.5, this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 1.6, 2.6);
    this.reverbSend = gain(ctx, 0.28, this.reverb);
    this.reverb.connect(this.master);
    this.noise = noiseBuffer(ctx, 2);
  }

  setReverb(seconds: number, decay: number, send: number): void {
    if (!this.ctx) return;
    this.reverb.buffer = impulse(this.ctx, seconds, decay);
    this.reverbSend.gain.setTargetAtTime(send, this.ctx.currentTime, 0.2);
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Voz no barramento de efeitos, com envio de reverberação. */
  voice(delay = 0, wet = 0.4): Voice | null {
    if (!this.ready || !this.ctx) return null;
    const out = this.ctx.createGain();
    out.connect(this.sfx);
    if (wet > 0) {
      const send = this.ctx.createGain();
      send.gain.value = wet;
      out.connect(send);
      send.connect(this.reverbSend);
    }
    return { ctx: this.ctx, t: this.ctx.currentTime + delay, out };
  }

  /** Voz posicionada no espaço 3D (robôs, impactos distantes). */
  voiceAt(x: number, y: number, z: number, delay = 0, wet = 0.5): Voice | null {
    const v = this.voice(delay, 0);
    if (!v) return null;
    const p = v.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 3;
    p.rolloffFactor = 1.1;
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    const g = v.ctx.createGain();
    g.connect(p);
    p.connect(v.out);
    registerPanner(g, p);
    if (wet > 0) {
      const send = v.ctx.createGain();
      send.gain.value = wet;
      g.connect(send);
      send.connect(this.reverbSend);
    }
    return { ctx: v.ctx, t: v.t, out: g };
  }

  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (!this.listenerReady && !('positionX' in l)) return;
    this.listenerReady = true;
    const t = this.ctx.currentTime;
    l.positionX.setTargetAtTime(x, t, 0.02);
    l.positionY.setTargetAtTime(y, t, 0.02);
    l.positionZ.setTargetAtTime(z, t, 0.02);
    l.forwardX.setTargetAtTime(fx, t, 0.02);
    l.forwardY.setTargetAtTime(fy, t, 0.02);
    l.forwardZ.setTargetAtTime(fz, t, 0.02);
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  }
}

export function gain(ctx: BaseAudioContext, value: number, dest: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(dest);
  return g;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Envelope de ataque e queda exponencial sobre um parâmetro de ganho. */
export function envelope(p: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  p.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  gain: number;
  attack?: number;
  decay: number;
  at?: number;
}

export function tone(v: Voice, o: ToneOpts): void {
  const t = v.t + (o.at ?? 0);
  const osc = v.ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + (o.attack ?? 0.002) + o.decay);
  const g = v.ctx.createGain();
  envelope(g.gain, t, o.gain, o.attack ?? 0.002, o.decay);
  osc.connect(g);
  g.connect(v.out);
  osc.start(t);
  osc.stop(t + (o.attack ?? 0.002) + o.decay + 0.05);
}

export interface NoiseOpts {
  filter?: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  gain: number;
  attack?: number;
  decay: number;
  at?: number;
  rate?: number;
}

export function noise(v: Voice, buffer: AudioBuffer, o: NoiseOpts): void {
  const t = v.t + (o.at ?? 0);
  const src = v.ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = o.rate ?? 1;
  const f = v.ctx.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + (o.attack ?? 0.002) + o.decay);
  f.Q.value = o.q ?? 0.8;
  const g = v.ctx.createGain();
  envelope(g.gain, t, o.gain, o.attack ?? 0.002, o.decay);
  src.connect(f);
  f.connect(g);
  g.connect(v.out);
  const dur = (o.attack ?? 0.002) + o.decay + 0.05;
  src.start(t, Math.random() * 1.5, dur);
  src.stop(t + dur);
}

/** Som contínuo posicionado (rotor do drone, zumbido): oscilador + filtro + panner, que o dono move e desliga. */
export interface Loop {
  setPosition(x: number, y: number, z: number): void;
  setPitch(freq: number): void;
  setLevel(level: number): void;
  stop(): void;
}

export function createLoop(a: AudioEngine, type: OscillatorType, freq: number, level: number, filterFreq: number): Loop | null {
  const v = a.voiceAt(0, 0, 0, 0, 0.15);
  if (!v) return null;
  const ctx = v.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 7 + Math.random() * 4;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = freq * 0.03;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(level, ctx.currentTime, 0.2);
  osc.connect(f);
  f.connect(g);
  g.connect(v.out);
  osc.start();
  lfo.start();
  // A voz posicionada termina num panner; achamos o panner pelo grafo criado em voiceAt.
  const panner = findPanner(v.out);
  let stopped = false;
  return {
    setPosition(x, y, z) {
      if (!panner || stopped) return;
      const t = ctx.currentTime;
      panner.positionX.setTargetAtTime(x, t, 0.03);
      panner.positionY.setTargetAtTime(y, t, 0.03);
      panner.positionZ.setTargetAtTime(z, t, 0.03);
    },
    setPitch(fr) {
      if (!stopped) osc.frequency.setTargetAtTime(fr, ctx.currentTime, 0.08);
    },
    setLevel(l) {
      if (!stopped) g.gain.setTargetAtTime(l, ctx.currentTime, 0.1);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      osc.stop(ctx.currentTime + 0.3);
      lfo.stop(ctx.currentTime + 0.3);
    },
  };
}

const panners = new WeakMap<AudioNode, PannerNode>();

export function registerPanner(input: AudioNode, panner: PannerNode): void {
  panners.set(input, panner);
}

function findPanner(input: AudioNode): PannerNode | undefined {
  return panners.get(input);
}

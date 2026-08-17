// Sample events from Kenney CC0 packs + layered procedural wind / vario.
// https://kenney.nl/assets/interface-sounds  https://kenney.nl/assets/impact-sounds

import type { RingKind } from './types';

const SAMPLE_URLS = {
  ring: '/audio/ring.ogg',
  gold: '/audio/ring-gold.ogg',
  boost: '/audio/boost.ogg',
  orb: '/audio/orb.ogg',
  miss: '/audio/miss.ogg',
  land: '/audio/land.ogg',
  crash: '/audio/crash.ogg',
} as const;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private samples = new Map<string, AudioBuffer>();

  private windGain: GainNode | null = null;
  private windAir: BiquadFilterNode | null = null;
  private windRumble: BiquadFilterNode | null = null;
  private sources: AudioBufferSourceNode[] = [];

  private varioOsc: OscillatorNode | null = null;
  private varioGain: GainNode | null = null;
  private varioNextBeep = 0;
  private varioEnabled = true;
  private muted = false;

  public init(): void {
    if (this.ctx) return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.72, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this.setupWind();
      this.setupVario();
      void this.loadSamples();
    } catch {
      // Audio blocked or unsupported
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private async loadSamples(): Promise<void> {
    if (!this.ctx) return;
    await Promise.all(
      Object.entries(SAMPLE_URLS).map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
          this.samples.set(key, buf);
        } catch {
          // keep synth fallback
        }
      }),
    );
  }

  private pinkBuffer(seconds: number): AudioBuffer {
    const rate = this.ctx!.sampleRate;
    const n = Math.floor(rate * seconds);
    const buffer = this.ctx!.createBuffer(1, n, rate);
    const out = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      out[i] = pink * 0.11;
    }
    return buffer;
  }

  private setupWind(): void {
    if (!this.ctx || !this.masterGain) return;
    const noise = this.pinkBuffer(4);

    const srcA = this.ctx.createBufferSource();
    srcA.buffer = noise;
    srcA.loop = true;
    this.windAir = this.ctx.createBiquadFilter();
    this.windAir.type = 'bandpass';
    this.windAir.frequency.value = 520;
    this.windAir.Q.value = 0.7;

    const srcB = this.ctx.createBufferSource();
    srcB.buffer = noise;
    srcB.loop = true;
    srcB.playbackRate.value = 0.72;
    this.windRumble = this.ctx.createBiquadFilter();
    this.windRumble.type = 'lowpass';
    this.windRumble.frequency.value = 180;
    this.windRumble.Q.value = 0.5;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.01;

    srcA.connect(this.windAir);
    this.windAir.connect(this.windGain);
    srcB.connect(this.windRumble);
    this.windRumble.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    srcA.start();
    srcB.start();
    this.sources.push(srcA, srcB);
  }

  private setupVario(): void {
    if (!this.ctx || !this.masterGain) return;
    this.varioOsc = this.ctx.createOscillator();
    this.varioOsc.type = 'sine';
    this.varioOsc.frequency.value = 640;
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1400;
    this.varioGain = this.ctx.createGain();
    this.varioGain.gain.value = 0;
    this.varioOsc.connect(tone);
    tone.connect(this.varioGain);
    this.varioGain.connect(this.masterGain);
    this.varioOsc.start();
  }

  private playBuffer(name: string, volume = 0.55, rate = 1): boolean {
    if (!this.ctx || !this.masterGain || this.muted) return false;
    const buf = this.samples.get(name);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
    return true;
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 1.35), now + dur * 0.7);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  public update(speed: number, verticalSpeed: number, isFlying: boolean): void {
    if (!this.ctx || this.muted || !isFlying) {
      if (this.windGain && this.ctx) this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      if (this.varioGain && this.ctx) this.varioGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      return;
    }
    const now = this.ctx.currentTime;
    if (this.windGain && this.windAir && this.windRumble) {
      const speedNorm = Math.max(0, Math.min(1, (speed - 7) / 34));
      this.windGain.gain.setTargetAtTime(0.04 + speedNorm * 0.22, now, 0.1);
      this.windAir.frequency.setTargetAtTime(340 + speedNorm * 720, now, 0.1);
      this.windRumble.frequency.setTargetAtTime(90 + speedNorm * 160, now, 0.12);
    }
    if (this.varioOsc && this.varioGain && this.varioEnabled) {
      if (verticalSpeed > 0.45) {
        const climb = Math.min(verticalSpeed, 7);
        const pulse = Math.max(0.1, 0.46 - climb * 0.04);
        this.varioOsc.frequency.setTargetAtTime(620 + climb * 150, now, 0.04);
        if (now >= this.varioNextBeep) {
          this.varioGain.gain.setValueAtTime(0.07, now);
          this.varioGain.gain.exponentialRampToValueAtTime(0.001, now + pulse * 0.45);
          this.varioNextBeep = now + pulse;
        }
      } else if (verticalSpeed < -3.4) {
        const sink = Math.min(Math.abs(verticalSpeed), 9);
        this.varioOsc.frequency.setTargetAtTime(Math.max(180, 380 - sink * 22), now, 0.06);
        this.varioGain.gain.setTargetAtTime(0.05, now, 0.08);
      } else {
        this.varioGain.gain.setTargetAtTime(0, now, 0.06);
      }
    }
  }

  public playRingSound(type: RingKind): void {
    const key = type === 'gold' ? 'gold' : type === 'boost' ? 'boost' : 'ring';
    const rate = type === 'gold' ? 1.05 : type === 'boost' ? 1.12 : 1;
    if (this.playBuffer(key, 0.58, rate)) return;
    const freq = type === 'gold' ? 784 : type === 'boost' ? 988 : 523;
    this.blip(freq, 0.28, 'triangle', 0.18);
  }

  public playBoostSound(): void {
    if (this.playBuffer('boost', 0.5, 0.92)) return;
    this.blip(196, 0.4, 'sawtooth', 0.12);
  }

  public playOrbSound(): void {
    if (this.playBuffer('orb', 0.45, 1.08)) return;
    this.blip(880, 0.22, 'sine', 0.14);
  }

  public playMissSound(): void {
    if (this.playBuffer('miss', 0.4, 0.9)) return;
    this.blip(220, 0.22, 'square', 0.1);
  }

  public playLandingSound(soft: boolean): void {
    if (this.playBuffer(soft ? 'land' : 'crash', soft ? 0.5 : 0.62, soft ? 1 : 0.85)) return;
    this.blip(soft ? 392 : 140, 0.32, soft ? 'sine' : 'triangle', 0.16);
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public toggleVario(): boolean {
    this.varioEnabled = !this.varioEnabled;
    return this.varioEnabled;
  }
}

export const audio = new SoundEngine();

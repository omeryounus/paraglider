// 100% Offline Synthesized Web Audio API Engine for Aero Glide
// Generates variometer climb/sink tones, wind rushing, surge effects, and touchdown sounds.

import type { RingKind } from './types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Wind noise nodes
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windNoise: AudioBufferSourceNode | null = null;

  // Variometer nodes
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
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.setupWindNoise();
      this.setupVario();
    } catch {
      // AudioContext not supported or blocked
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private setupWindNoise(): void {
    if (!this.ctx || !this.masterGain) return;
    // Generate 3 seconds of white noise buffer
    const bufferSize = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.windNoise = this.ctx.createBufferSource();
    this.windNoise.buffer = noiseBuffer;
    this.windNoise.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.setValueAtTime(420, this.ctx.currentTime);
    this.windFilter.Q.setValueAtTime(1.4, this.ctx.currentTime);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.01, this.ctx.currentTime);

    this.windNoise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    this.windNoise.start();
  }

  private setupVario(): void {
    if (!this.ctx || !this.masterGain) return;
    this.varioOsc = this.ctx.createOscillator();
    this.varioOsc.type = 'sine';
    this.varioOsc.frequency.setValueAtTime(700, this.ctx.currentTime);

    this.varioGain = this.ctx.createGain();
    this.varioGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.varioOsc.connect(this.varioGain);
    this.varioGain.connect(this.masterGain);
    this.varioOsc.start();
  }

  public update(speed: number, verticalSpeed: number, isFlying: boolean): void {
    if (!this.ctx || this.muted || !isFlying) {
      if (this.windGain && this.ctx) this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      if (this.varioGain && this.ctx) this.varioGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }

    const now = this.ctx.currentTime;

    // Wind Sound: volume & frequency scale with airspeed
    if (this.windGain && this.windFilter) {
      const speedNorm = Math.max(0, Math.min(1, (speed - 8) / 36));
      const targetGain = 0.05 + speedNorm * 0.38;
      const targetFreq = 280 + speedNorm * 850;
      this.windGain.gain.setTargetAtTime(targetGain, now, 0.08);
      this.windFilter.frequency.setTargetAtTime(targetFreq, now, 0.08);
    }

    // Variometer Audio:
    // Climbing in thermals: intermittent pulsed beeps
    // Sinking in downdrafts: continuous sink tone
    if (this.varioOsc && this.varioGain && this.varioEnabled) {
      if (verticalSpeed > 0.35) {
        const climbRate = Math.min(verticalSpeed, 8.0);
        const freq = 680 + climbRate * 180;
        const pulseInterval = Math.max(0.08, 0.42 - climbRate * 0.04);
        const pulseDuration = pulseInterval * 0.55;

        this.varioOsc.frequency.setTargetAtTime(freq, now, 0.03);

        if (now >= this.varioNextBeep) {
          this.varioGain.gain.setValueAtTime(0.18, now);
          this.varioGain.gain.setValueAtTime(0, now + pulseDuration);
          this.varioNextBeep = now + pulseInterval;
        }
      } else if (verticalSpeed < -3.2) {
        const sinkRate = Math.min(Math.abs(verticalSpeed), 9.0);
        const freq = Math.max(220, 420 - sinkRate * 25);
        this.varioOsc.frequency.setTargetAtTime(freq, now, 0.05);
        this.varioGain.gain.setTargetAtTime(0.14, now, 0.05);
        this.varioNextBeep = now + 0.1;
      } else {
        this.varioGain.gain.setTargetAtTime(0, now, 0.05);
      }
    }
  }

  public playRingSound(type: RingKind): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const baseFreq = type === 'gold' ? 880 : type === 'boost' ? 1046 : 587;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.18);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playBoostSound(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.4);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  public playLandingSound(soft: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = soft ? 'sine' : 'square';
    osc.frequency.setValueAtTime(soft ? 440 : 160, now);
    if (soft) {
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
    } else {
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.35);
    }

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.41);
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

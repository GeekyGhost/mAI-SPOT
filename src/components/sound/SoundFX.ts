// Web Audio API Retro Sound Effects Engine
// 100% Client-side synthesis: zero external audio assets, zero cloud latency.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export interface SoundConfig {
  enabled: boolean;
  theme: 'icq_classic' | 'synthwave' | 'win95' | 'minimal';
  volume: number;
}

class SoundEngine {
  private config: SoundConfig = {
    enabled: true,
    theme: 'icq_classic',
    volume: 0.5,
  };

  public setConfig(newConfig: Partial<SoundConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): SoundConfig {
    return { ...this.config };
  }

  // Classic ICQ "Uh-oh!" downward horn
  public playUhOh() {
    if (!this.config.enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = this.config.theme === 'synthwave' ? 'sawtooth' : 'triangle';

    // Tone 1: 784 Hz (G5) for 0.12s
    osc.frequency.setValueAtTime(784, now);
    // Tone 2: drops sharply to 523 Hz (C5) for 0.25s
    osc.frequency.setValueAtTime(523, now + 0.14);

    const masterVol = Math.max(0.01, Math.min(1, this.config.volume)) * 0.18;
    gain.gain.setValueAtTime(masterVol, now);
    gain.gain.setValueAtTime(masterVol * 1.2, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  // Typewriter mechanic click (message sent)
  public playMessageSent() {
    if (!this.config.enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    const masterVol = Math.max(0.01, Math.min(1, this.config.volume)) * 0.12;
    gain.gain.setValueAtTime(masterVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Pager alert / Friend online chime (Ascending Two-Tone Chime)
  public playPeerOnline() {
    if (!this.config.enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // 587 Hz (D5) -> 880 Hz (A5)
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.setValueAtTime(880, now + 0.12);

    const masterVol = Math.max(0.01, Math.min(1, this.config.volume)) * 0.15;
    gain.gain.setValueAtTime(masterVol, now);
    gain.gain.setValueAtTime(masterVol, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.42);
  }

  // 8-bit Coin Blip (Like/Appreciation received)
  public playCoin() {
    if (!this.config.enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    // B5 (987.77 Hz) -> E6 (1318.51 Hz)
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.08);

    const masterVol = Math.max(0.01, Math.min(1, this.config.volume)) * 0.14;
    gain.gain.setValueAtTime(masterVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  // Retro phone ring / call trill
  public playCallRing() {
    if (!this.config.enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(440, now);
    osc2.frequency.setValueAtTime(480, now);

    const masterVol = Math.max(0.01, Math.min(1, this.config.volume)) * 0.12;
    gain.gain.setValueAtTime(masterVol, now);
    gain.gain.setValueAtTime(0.001, now + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  }

  // Mechanical knob / button click sound
  public playClick() {
    if (!this.config.enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.03);

    const masterVol = Math.max(0.01, Math.min(1, this.config.volume)) * 0.15;
    gain.gain.setValueAtTime(masterVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }
}

export const soundFX = new SoundEngine();

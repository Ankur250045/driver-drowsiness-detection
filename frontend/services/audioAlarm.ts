/**
 * Alert channels on the device: a pulsing Web Audio alarm and vibration (haptics).
 * Both can fail silently (autoplay policy, muted tab, desktop without vibration motor),
 * so each reports whether it is actually working — the escalation logic uses this
 * to decide how quickly to fall back to a phone call.
 */
export class AudioAlarm {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private isPlaying = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) this.audioContext = new Ctx();
    }
  }

  /** Starts the alarm. Resolves to true only if audio output is actually running. */
  async play(): Promise<boolean> {
    const ctx = this.audioContext;
    if (!ctx || this.isPlaying) return this.isAudible();
    try {
      if (ctx.state === 'suspended') await ctx.resume();
    } catch {
      /* autoplay policy — stays suspended */
    }

    this.oscillator = ctx.createOscillator();
    this.gainNode = ctx.createGain();
    this.oscillator.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);
    this.oscillator.type = 'square';
    this.oscillator.frequency.value = 880;
    this.gainNode.gain.value = 0.25;
    this.oscillator.start();
    this.isPlaying = true;

    this.pulseTimer = setInterval(() => {
      if (!this.gainNode) return;
      this.gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      this.gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
    }, 600);

    return this.isAudible();
  }

  isAudible(): boolean {
    return this.isPlaying && this.audioContext?.state === 'running';
  }

  stop() {
    if (this.pulseTimer) clearInterval(this.pulseTimer);
    this.pulseTimer = null;
    this.oscillator?.stop();
    this.oscillator?.disconnect();
    this.gainNode?.disconnect();
    this.oscillator = null;
    this.gainNode = null;
    this.isPlaying = false;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

/** Vibration API wrapper (Android Chrome; not supported on iOS Safari or most desktops). */
export const haptics = {
  supported: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  /** Returns true if the browser accepted the vibration request. */
  alarm(): boolean {
    if (!this.supported) return false;
    try {
      return navigator.vibrate([600, 200, 600, 200, 600]);
    } catch {
      return false;
    }
  },
  stop() {
    if (this.supported) navigator.vibrate(0);
  },
};

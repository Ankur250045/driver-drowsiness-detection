// alarm.js — beeping alarm (Web Audio) and phone vibration (Vibration API).
// Both can fail silently (browser blocks sound until the user clicks something,
// iPhones and laptops can't vibrate), so each one reports whether it works.

export class Alarm {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = Ctx ? new Ctx() : null;
    this.osc = null;
    this.gain = null;
    this.timer = null;
    this.playing = false;
    this.volume = 0.3;
    this.muted = false;
  }

  // Browsers only allow sound after a user gesture; call this from a click handler.
  unlock() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  async play() {
    if (!this.ctx || this.playing) return this.isAudible();
    try {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch {
      // still blocked
    }
    this.osc = this.ctx.createOscillator();
    this.gain = this.ctx.createGain();
    this.osc.type = 'square';
    this.osc.frequency.value = 880;
    this.gain.gain.value = this.volume;
    this.osc.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.osc.start();
    this.playing = true;
    // beep-beep pattern
    this.timer = setInterval(() => {
      if (!this.gain) return;
      const t = this.ctx.currentTime;
      this.gain.gain.setValueAtTime(this.volume, t);
      this.gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
    }, 600);
    return this.isAudible();
  }

  isAudible() {
    return this.playing && this.ctx && this.ctx.state === 'running';
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.osc) {
      this.osc.stop();
      this.osc.disconnect();
    }
    if (this.gain) this.gain.disconnect();
    this.osc = null;
    this.gain = null;
    this.playing = false;
  }
}

export const phoneVibration = {
  supported: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  start() {
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

// Spoken warning using the browser's built-in text-to-speech.
export const SLEEPY_MESSAGE = 'Driver sleepy. Stop and hydrate.';

export const voice = {
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  speak(text = SLEEPY_MESSAGE) {
    if (!this.supported) return false;
    window.speechSynthesis.cancel(); // don't queue up old messages
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-IN';
    u.rate = 0.95;
    u.volume = 1;
    window.speechSynthesis.speak(u);
    return true;
  },
  stop() {
    if (this.supported) window.speechSynthesis.cancel();
  },
};

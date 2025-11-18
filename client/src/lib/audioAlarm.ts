export class AudioAlarm {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  play() {
    if (!this.audioContext || this.isPlaying) return;

    this.oscillator = this.audioContext.createOscillator();
    this.gainNode = this.audioContext.createGain();

    this.oscillator.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    this.oscillator.type = 'sine';
    this.oscillator.frequency.value = 800;
    this.gainNode.gain.value = 0.3;

    this.oscillator.start();
    this.isPlaying = true;

    const pulseInterval = setInterval(() => {
      if (!this.isPlaying || !this.gainNode) {
        clearInterval(pulseInterval);
        return;
      }
      this.gainNode.gain.setValueAtTime(0.3, this.audioContext!.currentTime);
      this.gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext!.currentTime + 0.5);
    }, 1000);
  }

  stop() {
    if (this.oscillator) {
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    this.isPlaying = false;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

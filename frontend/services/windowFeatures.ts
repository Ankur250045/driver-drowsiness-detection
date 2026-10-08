import type { FeatureVector, FrameMeasurement } from '@/types';

export interface Segment {
  start: number; // ms
  end: number; // ms
  ongoing: boolean;
}

export interface WindowThresholds {
  earThreshold: number;
  marThreshold: number;
  microsleepSeconds: number;
  /** Minimum mouth-open duration (s) to count as a yawn. */
  yawnMinSeconds?: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Contiguous runs where `predicate` holds. A run still active on the last frame
 * is marked `ongoing`. Each frame is assumed to last until the next frame.
 */
export function findSegments(
  frames: FrameMeasurement[],
  predicate: (f: FrameMeasurement) => boolean,
): Segment[] {
  const segments: Segment[] = [];
  let start: number | null = null;
  for (let i = 0; i < frames.length; i++) {
    const on = predicate(frames[i]);
    if (on && start === null) start = frames[i].t;
    if (!on && start !== null) {
      segments.push({ start, end: frames[i].t, ongoing: false });
      start = null;
    }
  }
  if (start !== null) {
    segments.push({ start, end: frames[frames.length - 1].t, ongoing: true });
  }
  return segments;
}

/** Window-level features (see ml/feature_spec.json) from per-frame measurements. */
export function computeWindowFeatures(
  frames: FrameMeasurement[],
  th: WindowThresholds,
): FeatureVector {
  const yawnMin = th.yawnMinSeconds ?? 1.0;
  const ears = frames.map((f) => f.ear);
  const mars = frames.map((f) => f.mar);
  const pitches = frames.map((f) => f.pose.pitch);
  const yaws = frames.map((f) => f.pose.yaw);

  const spanSec = frames.length > 1 ? (frames[frames.length - 1].t - frames[0].t) / 1000 : 0;
  // Avoid exploding per-minute rates while the window is still filling.
  const perMinute = 60 / Math.max(spanSec, 5);

  const closures = findSegments(frames, (f) => f.ear < th.earThreshold);
  const closureDur = closures.map((s) => (s.end - s.start) / 1000);
  const blinks = closures.filter(
    (s, i) => !s.ongoing && closureDur[i] > 0 && closureDur[i] < th.microsleepSeconds,
  );

  const yawns = findSegments(frames, (f) => f.mar > th.marThreshold).filter(
    (s) => (s.end - s.start) / 1000 >= yawnMin,
  );

  return {
    ear_mean: mean(ears),
    ear_std: std(ears),
    perclos: frames.length ? frames.filter((f) => f.ear < th.earThreshold).length / frames.length : 0,
    blink_rate: blinks.length * perMinute,
    blink_duration_mean: mean(closureDur),
    longest_closure: closureDur.length ? Math.max(...closureDur) : 0,
    mar_mean: mean(mars),
    yawn_rate: yawns.length * perMinute,
    pitch_mean: mean(pitches),
    pitch_std: std(pitches),
    yaw_std: std(yaws),
  };
}

/** Fixed-duration ring buffer of frame measurements. */
export class SlidingWindow {
  private frames: FrameMeasurement[] = [];

  constructor(private windowMs: number) {}

  push(frame: FrameMeasurement): void {
    this.frames.push(frame);
    const cutoff = frame.t - this.windowMs;
    while (this.frames.length && this.frames[0].t < cutoff) this.frames.shift();
  }

  clear(): void {
    this.frames = [];
  }

  get values(): FrameMeasurement[] {
    return this.frames;
  }

  /** Duration of the current continuous eye closure (s), 0 if eyes open. */
  currentClosureSeconds(earThreshold: number): number {
    const f = this.frames;
    if (!f.length || f[f.length - 1].ear >= earThreshold) return 0;
    let i = f.length - 1;
    while (i > 0 && f[i - 1].ear < earThreshold) i--;
    return (f[f.length - 1].t - f[i].t) / 1000;
  }
}

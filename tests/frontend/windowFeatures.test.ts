import { describe, expect, it } from 'vitest';
import { SlidingWindow, computeWindowFeatures, findSegments } from '@/services/windowFeatures';
import type { FrameMeasurement } from '@/types';

const TH = { earThreshold: 0.2, marThreshold: 0.5, microsleepSeconds: 1 };

/** 30 FPS frames; `ear(t)` and `mar(t)` give values at time t (seconds). */
function frames(seconds: number, ear: (t: number) => number, mar: (t: number) => number = () => 0.1): FrameMeasurement[] {
  return Array.from({ length: Math.round(seconds * 30) }, (_, i) => {
    const t = i / 30;
    return { t: t * 1000, ear: ear(t), earLeft: ear(t), earRight: ear(t), mar: mar(t), pose: { pitch: 0, yaw: 0, roll: 0 } };
  });
}

describe('findSegments', () => {
  it('finds closed and ongoing runs', () => {
    const f = frames(3, (t) => (t >= 1 && t < 1.5) || t >= 2.5 ? 0.1 : 0.3);
    const segs = findSegments(f, (x) => x.ear < 0.2);
    expect(segs).toHaveLength(2);
    expect((segs[0].end - segs[0].start) / 1000).toBeCloseTo(0.5, 1);
    expect(segs[0].ongoing).toBe(false);
    expect(segs[1].ongoing).toBe(true);
  });
});

describe('computeWindowFeatures', () => {
  it('alert driver: no closures, PERCLOS 0', () => {
    const f = computeWindowFeatures(frames(10, () => 0.3), TH);
    expect(f.perclos).toBe(0);
    expect(f.blink_rate).toBe(0);
    expect(f.longest_closure).toBe(0);
    expect(f.ear_mean).toBeCloseTo(0.3, 6);
  });

  it('counts short blinks and converts to a per-minute rate', () => {
    // 3 blinks of 0.2 s in 10 s → 18 blinks/min
    const blink = (t: number) => [2, 5, 8].some((s) => t >= s && t < s + 0.2);
    const f = computeWindowFeatures(frames(10, (t) => (blink(t) ? 0.1 : 0.3)), TH);
    expect(f.blink_rate).toBeCloseTo(18, 0);
    expect(f.blink_duration_mean).toBeCloseTo(0.2, 1);
    expect(f.perclos).toBeCloseTo(0.06, 2);
  });

  it('a long closure is a microsleep, not a blink', () => {
    const f = computeWindowFeatures(frames(10, (t) => (t >= 3 && t < 5 ? 0.1 : 0.3)), TH);
    expect(f.blink_rate).toBe(0);
    expect(f.longest_closure).toBeCloseTo(2, 1);
    expect(f.perclos).toBeCloseTo(0.2, 2);
  });

  it('detects yawns lasting at least 1 s', () => {
    const f = computeWindowFeatures(frames(10, () => 0.3, (t) => (t >= 2 && t < 4 ? 0.8 : 0.1)), TH);
    expect(f.yawn_rate).toBeCloseTo(6, 0); // 1 yawn in 10 s
  });

  it('does not explode rates while the window is still filling', () => {
    const f = computeWindowFeatures(frames(1, (t) => (t > 0.4 && t < 0.6 ? 0.1 : 0.3)), TH);
    expect(f.blink_rate).toBeLessThanOrEqual(12); // 1 blink / max(span, 5 s)
  });
});

describe('SlidingWindow', () => {
  it('keeps only the last N ms and measures the current closure', () => {
    const w = new SlidingWindow(1000);
    for (const fr of frames(3, (t) => (t > 2.4 ? 0.1 : 0.3))) w.push(fr);
    expect(w.values[w.values.length - 1].t - w.values[0].t).toBeLessThanOrEqual(1000);
    expect(w.currentClosureSeconds(0.2)).toBeCloseTo(0.57, 1);
  });
});

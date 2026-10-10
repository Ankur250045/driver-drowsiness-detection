import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FEATURE_NAMES,
  LEFT_EYE,
  RIGHT_EYE,
  SlidingWindow,
  calculateEAR,
  calculateMAR,
  computeWindowFeatures,
  estimateHeadPose,
  eyeAspectRatio,
  findSegments,
} from '../../frontend/js/features.js';

const spec = JSON.parse(readFileSync(new URL('../../ml/feature_spec.json', import.meta.url), 'utf8'));

// 478 landmarks at the origin, with some points moved
function mesh(points) {
  const lm = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z = 0]] of Object.entries(points)) lm[i] = { x, y, z };
  return lm;
}

// an eye 30 px wide whose lids are `open` px apart
function eye(idx, cx, open) {
  const [p1, p2, p3, p4, p5, p6] = idx;
  return {
    [p1]: [cx - 15, 100],
    [p4]: [cx + 15, 100],
    [p2]: [cx - 5, 100 - open / 2],
    [p3]: [cx + 5, 100 - open / 2],
    [p6]: [cx - 5, 100 + open / 2],
    [p5]: [cx + 5, 100 + open / 2],
  };
}

describe('feature list', () => {
  it('matches ml/feature_spec.json', () => {
    expect(FEATURE_NAMES).toEqual(spec.features.map((f) => f.name));
  });
});

describe('eye aspect ratio', () => {
  it('follows the formula (9 + 9) / (2 * 30) = 0.3', () => {
    expect(eyeAspectRatio(mesh(eye(LEFT_EYE, 100, 9)), LEFT_EYE)).toBeCloseTo(0.3, 5);
  });

  it('drops when the eyes close', () => {
    const open = calculateEAR(mesh({ ...eye(LEFT_EYE, 100, 9), ...eye(RIGHT_EYE, 200, 9) }));
    const closed = calculateEAR(mesh({ ...eye(LEFT_EYE, 100, 1.5), ...eye(RIGHT_EYE, 200, 1.5) }));
    expect(open.mean).toBeGreaterThan(0.25);
    expect(closed.mean).toBeLessThan(0.1);
  });

  it('returns 0 instead of NaN for a degenerate eye', () => {
    expect(eyeAspectRatio(mesh({}), LEFT_EYE)).toBe(0);
  });
});

describe('mouth aspect ratio', () => {
  it('is the mean lip opening divided by mouth width', () => {
    const lm = mesh({ 78: [0, 0], 308: [50, 0], 13: [25, -10], 14: [25, 10], 81: [15, -10], 178: [15, 10], 311: [35, -10], 402: [35, 10] });
    expect(calculateMAR(lm)).toBeCloseTo(0.4, 5);
  });
});

describe('head pose', () => {
  const frontal = { 33: [0, 0, 0], 263: [60, 0, 0], 10: [30, -40, 0], 152: [30, 60, 0] };

  it('is 0 for a face looking straight at the camera', () => {
    const p = estimateHeadPose(mesh(frontal));
    expect(Math.abs(p.pitch) + Math.abs(p.yaw) + Math.abs(p.roll)).toBeLessThan(1e-6);
  });

  it('has positive pitch when the head drops forward', () => {
    expect(estimateHeadPose(mesh({ ...frontal, 10: [30, -40, -30], 152: [30, 60, 30] })).pitch).toBeGreaterThan(15);
  });
});

const TH = { earThreshold: 0.2, marThreshold: 0.5, microsleepSeconds: 1 };

// frames at 30 fps; ear(t) and mar(t) give the value at time t (seconds)
function frames(seconds, ear, mar = () => 0.1) {
  return Array.from({ length: Math.round(seconds * 30) }, (_, i) => {
    const t = i / 30;
    return { t: t * 1000, ear: ear(t), mar: mar(t), pose: { pitch: 0, yaw: 0, roll: 0 } };
  });
}

describe('window features', () => {
  it('alert driver: no closures', () => {
    const f = computeWindowFeatures(frames(10, () => 0.3), TH);
    expect(f.perclos).toBe(0);
    expect(f.blink_rate).toBe(0);
    expect(f.ear_mean).toBeCloseTo(0.3, 6);
  });

  it('counts blinks per minute', () => {
    // 3 blinks of 0.2 s in 10 s = 18 per minute
    const blink = (t) => [2, 5, 8].some((s) => t >= s && t < s + 0.2);
    const f = computeWindowFeatures(frames(10, (t) => (blink(t) ? 0.1 : 0.3)), TH);
    expect(f.blink_rate).toBeCloseTo(18, 0);
    expect(f.blink_duration_mean).toBeCloseTo(0.2, 1);
  });

  it('treats a 2 s closure as a microsleep, not a blink', () => {
    const f = computeWindowFeatures(frames(10, (t) => (t >= 3 && t < 5 ? 0.1 : 0.3)), TH);
    expect(f.blink_rate).toBe(0);
    expect(f.longest_closure).toBeCloseTo(2, 1);
    expect(f.perclos).toBeCloseTo(0.2, 2);
  });

  it('counts a yawn that lasts at least 1 s', () => {
    const f = computeWindowFeatures(frames(10, () => 0.3, (t) => (t >= 2 && t < 4 ? 0.8 : 0.1)), TH);
    expect(f.yawn_rate).toBeCloseTo(6, 0);
  });

  it('marks a closure that is still going as ongoing', () => {
    const segs = findSegments(frames(3, (t) => (t > 2.5 ? 0.1 : 0.3)), (x) => x.ear < 0.2);
    expect(segs).toHaveLength(1);
    expect(segs[0].ongoing).toBe(true);
  });
});

describe('SlidingWindow', () => {
  it('keeps only the last second and measures the current closure', () => {
    const w = new SlidingWindow(1000);
    for (const f of frames(3, (t) => (t > 2.4 ? 0.1 : 0.3))) w.push(f);
    expect(w.last().t - w.frames[0].t).toBeLessThanOrEqual(1000);
    expect(w.currentClosureSeconds(0.2)).toBeCloseTo(0.57, 1);
  });
});

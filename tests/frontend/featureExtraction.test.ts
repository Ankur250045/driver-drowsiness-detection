import { describe, expect, it } from 'vitest';
import {
  LEFT_EYE,
  RIGHT_EYE,
  calculateEAR,
  calculateMAR,
  estimateHeadPose,
  eyeAspectRatio,
} from '@/services/featureExtraction';
import type { Point3 } from '@/types';

/** 478 landmarks at the origin, with specific points overridden. */
function mesh(overrides: Record<number, [number, number, number?]>): Point3[] {
  const lm: Point3[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) lm[Number(i)] = { x, y, z: z ?? 0 };
  return lm;
}

/** Eye of width 30 px whose upper/lower lids are `open` px apart. */
function eye(idx: readonly number[], cx: number, open: number) {
  const [p1, p2, p3, p4, p5, p6] = idx;
  return {
    [p1]: [cx - 15, 100],
    [p4]: [cx + 15, 100],
    [p2]: [cx - 5, 100 - open / 2],
    [p3]: [cx + 5, 100 - open / 2],
    [p6]: [cx - 5, 100 + open / 2],
    [p5]: [cx + 5, 100 + open / 2],
  } as Record<number, [number, number]>;
}

describe('Eye Aspect Ratio', () => {
  it('matches the Soukupová & Čech formula', () => {
    // vertical distances 9 and 9, horizontal 30 → (9+9)/(2·30) = 0.3
    const lm = mesh(eye(LEFT_EYE, 100, 9));
    expect(eyeAspectRatio(lm, LEFT_EYE)).toBeCloseTo(0.3, 5);
  });

  it('drops when the eye closes', () => {
    const open = calculateEAR(mesh({ ...eye(LEFT_EYE, 100, 9), ...eye(RIGHT_EYE, 200, 9) }));
    const closed = calculateEAR(mesh({ ...eye(LEFT_EYE, 100, 1.5), ...eye(RIGHT_EYE, 200, 1.5) }));
    expect(open.mean).toBeGreaterThan(0.25);
    expect(closed.mean).toBeLessThan(0.1);
  });

  it('returns 0 for a degenerate eye instead of NaN', () => {
    expect(eyeAspectRatio(mesh({}), LEFT_EYE)).toBe(0);
  });
});

describe('Mouth Aspect Ratio', () => {
  it('is the mean inner-lip opening over mouth width', () => {
    const lm = mesh({
      78: [0, 0],
      308: [50, 0],
      13: [25, -10],
      14: [25, 10],
      81: [15, -10],
      178: [15, 10],
      311: [35, -10],
      402: [35, 10],
    });
    expect(calculateMAR(lm)).toBeCloseTo(20 / 50, 5);
  });
});

describe('Head pose', () => {
  const frontal = { 33: [0, 0, 0], 263: [60, 0, 0], 10: [30, -40, 0], 152: [30, 60, 0] } as Record<number, [number, number, number]>;

  it('is ~0° for a frontal face', () => {
    const pose = estimateHeadPose(mesh(frontal));
    expect(Math.abs(pose.pitch)).toBeLessThan(1e-6);
    expect(Math.abs(pose.yaw)).toBeLessThan(1e-6);
    expect(Math.abs(pose.roll)).toBeLessThan(1e-6);
  });

  it('reports positive pitch when the head tilts down (chin away, forehead towards camera)', () => {
    const pose = estimateHeadPose(mesh({ ...frontal, 10: [30, -40, -30], 152: [30, 60, 30] }));
    expect(pose.pitch).toBeGreaterThan(15);
  });

  it('reports roll when the eye line tilts', () => {
    const pose = estimateHeadPose(mesh({ ...frontal, 263: [60, 20, 0] }));
    expect(pose.roll).toBeGreaterThan(15);
  });
});

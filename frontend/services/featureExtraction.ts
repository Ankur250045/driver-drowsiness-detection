import type { HeadPose, Point3 } from '@/types';

/**
 * Per-frame geometric features from the 478-point MediaPipe Face Mesh.
 *
 * EAR (Eye Aspect Ratio) — Soukupová & Čech, "Real-Time Eye Blink Detection
 * using Facial Landmarks", CVWW 2016:
 *     EAR = (|p2 − p6| + |p3 − p5|) / (2 · |p1 − p4|)
 */

// [p1 (outer corner), p2, p3, p4 (inner corner), p5, p6]
export const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const;
export const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const;

// Three vertical lip pairs across the inner lip contour, normalised by mouth width.
export const MOUTH_VERTICAL: ReadonlyArray<readonly [number, number]> = [
  [13, 14],
  [81, 178],
  [311, 402],
];
export const MOUTH_CORNERS = [78, 308] as const;

// Landmarks used for head-pose estimation.
export const POSE_POINTS = { leftEye: 33, rightEye: 263, forehead: 10, chin: 152 } as const;

type P = { x: number; y: number; z?: number };

export function distance(a: P, b: P): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function eyeAspectRatio(lm: P[], idx: readonly number[]): number {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => lm[i]);
  const horizontal = distance(p1, p4);
  if (horizontal === 0) return 0;
  return (distance(p2, p6) + distance(p3, p5)) / (2 * horizontal);
}

export function calculateEAR(lm: P[]): { left: number; right: number; mean: number } {
  const left = eyeAspectRatio(lm, LEFT_EYE);
  const right = eyeAspectRatio(lm, RIGHT_EYE);
  return { left, right, mean: (left + right) / 2 };
}

/** MAR — mean of three inner-lip vertical distances over mouth width. */
export function calculateMAR(lm: P[]): number {
  const width = distance(lm[MOUTH_CORNERS[0]], lm[MOUTH_CORNERS[1]]);
  if (width === 0) return 0;
  const vertical =
    MOUTH_VERTICAL.reduce((sum, [a, b]) => sum + distance(lm[a], lm[b]), 0) / MOUTH_VERTICAL.length;
  return vertical / width;
}

const sub = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Point3, b: Point3): Point3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normalize = (a: Point3): Point3 => {
  const n = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / n, y: a.y / n, z: a.z / n };
};
const DEG = 180 / Math.PI;

/**
 * Approximate head pose from the 3D landmark mesh (no camera intrinsics needed).
 * Builds a face coordinate frame from the eye line (x) and forehead→chin line (y);
 * the face normal is their cross product.
 */
export function estimateHeadPose(lm: Point3[]): HeadPose {
  const { leftEye, rightEye, forehead, chin } = POSE_POINTS;
  const xAxis = normalize(sub(lm[rightEye], lm[leftEye]));
  const yAxis = normalize(sub(lm[chin], lm[forehead]));
  const normal = normalize(cross(xAxis, yAxis));
  return {
    pitch: Math.atan2(-normal.y, normal.z) * DEG,
    yaw: Math.atan2(normal.x, normal.z) * DEG,
    roll: Math.atan2(xAxis.y, xAxis.x) * DEG,
  };
}

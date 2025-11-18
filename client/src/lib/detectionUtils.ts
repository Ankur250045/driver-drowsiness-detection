export interface Point {
  x: number;
  y: number;
}

export function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function calculateEAR(landmarks: Point[]): number {
  const leftEye = {
    p1: landmarks[33],
    p2: landmarks[160],
    p3: landmarks[158],
    p4: landmarks[133],
    p5: landmarks[153],
    p6: landmarks[144],
  };

  const rightEye = {
    p1: landmarks[362],
    p2: landmarks[385],
    p3: landmarks[387],
    p4: landmarks[263],
    p5: landmarks[373],
    p6: landmarks[380],
  };

  const leftEAR =
    (calculateDistance(leftEye.p2, leftEye.p6) +
      calculateDistance(leftEye.p3, leftEye.p5)) /
    (2 * calculateDistance(leftEye.p1, leftEye.p4));

  const rightEAR =
    (calculateDistance(rightEye.p2, rightEye.p6) +
      calculateDistance(rightEye.p3, rightEye.p5)) /
    (2 * calculateDistance(rightEye.p1, rightEye.p4));

  return (leftEAR + rightEAR) / 2;
}

export function calculateMAR(landmarks: Point[]): number {
  const mouth = {
    top: landmarks[13],
    bottom: landmarks[14],
    left: landmarks[78],
    right: landmarks[308],
  };

  const verticalDist = calculateDistance(mouth.top, mouth.bottom);
  const horizontalDist = calculateDistance(mouth.left, mouth.right);

  return verticalDist / horizontalDist;
}

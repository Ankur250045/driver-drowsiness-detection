"""Desktop real-time demo with OpenCV + MediaPipe (Python), mirroring the web pipeline.

Computes EAR / MAR / head pitch per frame, the 11 window features over a 10 s
sliding window, and runs the exported JSON classifier. Press `q` to quit.

    python -m ml.inference.realtime_webcam [--camera 0]
"""

import argparse
import math
import time
from collections import deque

import numpy as np

from ml.config import FEATURES, FRONTEND_MODEL
from ml.inference.predict import PortableModel

LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
MOUTH_V = [(13, 14), (81, 178), (311, 402)]
MOUTH_H = (78, 308)


def _d(a, b):
    return math.dist(a[:2], b[:2])


def ear(lm, idx):
    p = [lm[i] for i in idx]
    return (_d(p[1], p[5]) + _d(p[2], p[4])) / (2 * _d(p[0], p[3]) + 1e-9)


def mar(lm):
    return np.mean([_d(lm[a], lm[b]) for a, b in MOUTH_V]) / (_d(lm[MOUTH_H[0]], lm[MOUTH_H[1]]) + 1e-9)


def head_pose(lm):
    le, re, top, chin = (np.array(lm[i]) for i in (33, 263, 10, 152))
    x = (re - le) / np.linalg.norm(re - le)
    y = (chin - top) / np.linalg.norm(chin - top)
    n = np.cross(x, y)
    n /= np.linalg.norm(n)
    return math.degrees(math.atan2(-n[1], n[2])), math.degrees(math.atan2(n[0], n[2]))


def segments(mask, t):
    out, start = [], None
    for m, ti in zip(mask, t):
        if m and start is None:
            start = ti
        if not m and start is not None:
            out.append(ti - start)
            start = None
    if start is not None:
        out.append(t[-1] - start)
    return out


def window_features(buf, ear_th, mar_th, microsleep=1.0):
    t = np.array([b[0] for b in buf])
    e, m, pitch, yaw = (np.array([b[i] for b in buf]) for i in range(1, 5))
    per_min = 60 / max(t[-1] - t[0], 5)
    closures = segments(e < ear_th, t)
    yawns = [s for s in segments(m > mar_th, t) if s >= 1.0]
    return {
        "ear_mean": e.mean(),
        "ear_std": e.std(ddof=1) if len(e) > 1 else 0,
        "perclos": float((e < ear_th).mean()),
        "blink_rate": sum(0 < c < microsleep for c in closures) * per_min,
        "blink_duration_mean": float(np.mean(closures)) if closures else 0.0,
        "longest_closure": max(closures, default=0.0),
        "mar_mean": m.mean(),
        "yawn_rate": len(yawns) * per_min,
        "pitch_mean": pitch.mean(),
        "pitch_std": pitch.std(ddof=1) if len(pitch) > 1 else 0,
        "yaw_std": yaw.std(ddof=1) if len(yaw) > 1 else 0,
    }


def main() -> None:
    import cv2
    import mediapipe as mp

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--ear-threshold", type=float, default=0.21)
    ap.add_argument("--mar-threshold", type=float, default=0.5)
    args = ap.parse_args()

    model = PortableModel.load(FRONTEND_MODEL)
    mesh = mp.solutions.face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True)
    cap = cv2.VideoCapture(args.camera)
    buf: deque = deque()
    prob = 0.0

    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        res = mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        now = time.time()
        if res.multi_face_landmarks:
            lm = [(p.x * w, p.y * h, p.z * w) for p in res.multi_face_landmarks[0].landmark]
            e = (ear(lm, LEFT_EYE) + ear(lm, RIGHT_EYE)) / 2
            pitch, yaw = head_pose(lm)
            buf.append((now, e, mar(lm), pitch, yaw))
            while buf and buf[0][0] < now - 10:
                buf.popleft()
            if len(buf) > 5:
                f = window_features(list(buf), args.ear_threshold, args.mar_threshold)
                p = model.predict_proba(np.array([[f[k] for k in FEATURES]]))[0]
                prob = 0.35 * p + 0.65 * prob
            color = (0, 0, 255) if prob > 0.85 else (0, 215, 255) if prob > 0.5 else (0, 200, 0)
            cv2.putText(frame, f"EAR {e:.3f}  P(drowsy) {prob:.2f}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
        cv2.imshow("DrowsiGuard (q to quit)", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

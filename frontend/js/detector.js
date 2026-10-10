// detector.js — MediaPipe Face Mesh through TensorFlow.js.
// The libraries are loaded with <script> tags in the HTML (window.tf and
// window.faceLandmarksDetection).

const FACE_MESH_VERSION = '0.4.1633559619';

export class FaceDetector {
  constructor() {
    this.detector = null;
    this.backend = '';
  }

  async init() {
    if (this.detector) return;
    const tf = window.tf;
    const fld = window.faceLandmarksDetection;
    if (!tf || !fld) throw new Error('TensorFlow.js did not load (check the internet connection).');
    await tf.ready();
    try {
      await tf.setBackend('webgl');
    } catch {
      await tf.setBackend('cpu');
    }
    this.backend = tf.getBackend();
    this.detector = await fld.createDetector(fld.SupportedModels.MediaPipeFaceMesh, {
      runtime: 'mediapipe',
      refineLandmarks: true,
      maxFaces: 1,
      solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${FACE_MESH_VERSION}`,
    });
  }

  // returns 478 points {x, y, z} or null when no face is visible
  async detect(video) {
    if (!this.detector) return null;
    try {
      const faces = await this.detector.estimateFaces(video, { flipHorizontal: false });
      if (!faces.length) return null;
      return faces[0].keypoints.map((k) => ({ x: k.x, y: k.y, z: k.z || 0 }));
    } catch (e) {
      console.error('Face detection error', e);
      return null;
    }
  }
}

export async function startCamera(video) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('No camera access in this browser. Open the page on localhost or over HTTPS.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((resolve) => (video.onloadedmetadata = resolve));
  await video.play();
  return stream;
}

export function stopCamera(stream) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
}

// Draws the eye and mouth outlines and the EAR/MAR measuring lines.
const LEFT_EYE_OUTLINE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const RIGHT_EYE_OUTLINE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];
const LIPS_OUTLINE = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];
const MEASURE_LINES = [
  [160, 144], [158, 153], [33, 133],
  [385, 380], [387, 373], [362, 263],
  [13, 14], [81, 178], [311, 402], [78, 308],
];

export function drawLandmarks(canvas, video, lm, color) {
  const ctx = canvas.getContext('2d');
  if (canvas.width !== video.videoWidth) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!lm) return;
  const line = (idx) => {
    ctx.beginPath();
    idx.forEach((i, k) => (k ? ctx.lineTo(lm[i].x, lm[i].y) : ctx.moveTo(lm[i].x, lm[i].y)));
    ctx.stroke();
  };
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 468; i += 4) ctx.fillRect(lm[i].x - 0.75, lm[i].y - 0.75, 1.5, 1.5);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  line(LEFT_EYE_OUTLINE);
  line(RIGHT_EYE_OUTLINE);
  line(LIPS_OUTLINE);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ffffff';
  MEASURE_LINES.forEach(line);
}

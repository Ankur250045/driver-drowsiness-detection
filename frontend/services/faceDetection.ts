import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import type { Point3 } from '@/types';

/** Wraps the MediaPipe Face Mesh model (478 3D landmarks incl. refined irises). */
export class FaceDetectionService {
  private detector: faceLandmarksDetection.FaceLandmarksDetector | null = null;
  backend = '';

  async initialize(): Promise<void> {
    if (this.detector) return;

    await tf.ready();
    try {
      await tf.setBackend('webgl');
    } catch {
      await tf.setBackend('cpu');
    }
    this.backend = tf.getBackend();

    this.detector = await faceLandmarksDetection.createDetector(
      faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
      {
        runtime: 'mediapipe',
        refineLandmarks: true,
        maxFaces: 1,
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619',
      },
    );
  }

  async detectFace(video: HTMLVideoElement): Promise<Point3[] | null> {
    if (!this.detector) return null;
    try {
      const faces = await this.detector.estimateFaces(video, { flipHorizontal: false });
      if (faces.length === 0) return null;
      return faces[0].keypoints.map((kp) => ({ x: kp.x, y: kp.y, z: kp.z ?? 0 }));
    } catch (error) {
      console.error('Face detection error:', error);
      return null;
    }
  }

  dispose(): void {
    this.detector?.dispose();
    this.detector = null;
  }
}

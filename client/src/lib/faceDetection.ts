import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import { Point } from './detectionUtils';

export class FaceDetectionService {
  private detector: faceLandmarksDetection.FaceLandmarksDetector | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await tf.ready();
    await tf.setBackend('webgl');

    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    const detectorConfig: faceLandmarksDetection.MediaPipeFaceMeshMediaPipeModelConfig = {
      runtime: 'mediapipe',
      refineLandmarks: true,
      solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
    };

    this.detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
    this.isInitialized = true;
  }

  async detectFace(video: HTMLVideoElement): Promise<Point[] | null> {
    if (!this.detector || !this.isInitialized) {
      return null;
    }

    try {
      const predictions = await this.detector.estimateFaces(video, {
        flipHorizontal: false,
      });

      if (predictions.length === 0) {
        return null;
      }

      const keypoints = predictions[0].keypoints;
      return keypoints.map((kp) => ({ x: kp.x, y: kp.y }));
    } catch (error) {
      console.error('Face detection error:', error);
      return null;
    }
  }

  dispose(): void {
    if (this.detector) {
      this.detector.dispose();
      this.detector = null;
      this.isInitialized = false;
    }
  }
}

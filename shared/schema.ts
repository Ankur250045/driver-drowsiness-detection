import { z } from "zod";

export type DetectionStatus = 'alert' | 'drowsy' | 'critical';

export interface DetectionSettings {
  earThreshold: number;
  earConsecFrames: number;
  marThreshold: number;
  marConsecFrames: number;
}

export interface DetectionMetrics {
  ear: number;
  mar: number;
  status: DetectionStatus;
  framesEyesClosed: number;
  framesYawning: number;
}

export const detectionSettingsSchema = z.object({
  earThreshold: z.number().min(0.1).max(0.5),
  earConsecFrames: z.number().int().min(5).max(60),
  marThreshold: z.number().min(0.3).max(1.0),
  marConsecFrames: z.number().int().min(5).max(60),
});

export type DetectionSettingsInput = z.infer<typeof detectionSettingsSchema>;

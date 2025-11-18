import { useEffect, useRef } from 'react';
import { DetectionStatus } from '@shared/schema';
import { Card } from '@/components/ui/card';

interface CameraFeedProps {
  onVideoReady: (video: HTMLVideoElement) => void;
  status: DetectionStatus;
  isCalibrating: boolean;
}

export function CameraFeed({ onVideoReady, status, isCalibrating }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            onVideoReady(videoRef.current!);
          };
        }
      } catch (error) {
        console.error('Camera access error:', error);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onVideoReady]);

  const getBorderClass = () => {
    if (isCalibrating) return 'border-primary';
    if (status === 'critical') return 'border-destructive animate-pulse-border';
    if (status === 'drowsy') return 'border-yellow-500';
    return 'border-primary/30';
  };

  return (
    <Card className={`overflow-hidden border-2 transition-all duration-300 ${getBorderClass()}`} data-testid="camera-feed">
      <div className="relative aspect-[4/3] bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          data-testid="video-element"
        />
        {isCalibrating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="text-center space-y-2">
              <div className="text-primary text-2xl font-semibold animate-pulse" data-testid="text-calibrating">
                Calibrating...
              </div>
              <p className="text-sm text-muted-foreground">Look at the camera</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

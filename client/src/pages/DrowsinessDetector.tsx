import { useEffect, useRef, useState, useCallback } from 'react';
import { DetectionStatus, DetectionSettings } from '@shared/schema';
import { FaceDetectionService } from '@/lib/faceDetection';
import { AudioAlarm } from '@/lib/audioAlarm';
import { calculateEAR, calculateMAR } from '@/lib/detectionUtils';
import { CameraFeed } from '@/components/CameraFeed';
import { StatusDashboard } from '@/components/StatusDashboard';
import { SettingsPanel } from '@/components/SettingsPanel';
import { AlertOverlay } from '@/components/AlertOverlay';
import { CalibrationModal } from '@/components/CalibrationModal';
import { DebugToggle } from '@/components/DebugToggle';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

const DEFAULT_SETTINGS: DetectionSettings = {
  earThreshold: 0.23,
  earConsecFrames: 15,
  marThreshold: 0.6,
  marConsecFrames: 10,
};

export default function DrowsinessDetector() {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<DetectionStatus>('alert');
  const [ear, setEar] = useState(0.3);
  const [mar, setMar] = useState(0.3);
  const [fps, setFps] = useState(0);
  const [settings, setSettings] = useState<DetectionSettings>(DEFAULT_SETTINGS);
  const [isMuted, setIsMuted] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [cameraError, setCameraError] = useState(false);

  const detectionServiceRef = useRef<FaceDetectionService | null>(null);
  const audioAlarmRef = useRef<AudioAlarm | null>(null);
  const framesEyesClosedRef = useRef(0);
  const framesYawningRef = useRef(0);
  const animationFrameRef = useRef<number>();
  const lastFrameTimeRef = useRef(0);
  const calibrationDataRef = useRef<{ ear: number[]; mar: number[] }>({ ear: [], mar: [] });

  useEffect(() => {
    const initModel = async () => {
      try {
        detectionServiceRef.current = new FaceDetectionService();
        await detectionServiceRef.current.initialize();
        setIsModelLoading(false);
      } catch (error) {
        console.error('Model initialization error:', error);
        setIsModelLoading(false);
      }
    };

    audioAlarmRef.current = new AudioAlarm();
    initModel();

    return () => {
      if (detectionServiceRef.current) {
        detectionServiceRef.current.dispose();
      }
      if (audioAlarmRef.current) {
        audioAlarmRef.current.stop();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const runDetection = useCallback(async () => {
    if (!video || !detectionServiceRef.current) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const now = performance.now();
    const deltaTime = now - lastFrameTimeRef.current;

    if (deltaTime < 1000 / 30) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    lastFrameTimeRef.current = now;
    setFps(1000 / deltaTime);

    const landmarks = await detectionServiceRef.current.detectFace(video);

    if (!landmarks) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const currentEar = calculateEAR(landmarks);
    const currentMar = calculateMAR(landmarks);

    setEar(currentEar);
    setMar(currentMar);

    if (!isCalibrating) {
      if (currentEar < settings.earThreshold) {
        framesEyesClosedRef.current++;
      } else {
        framesEyesClosedRef.current = 0;
      }

      if (currentMar > settings.marThreshold) {
        framesYawningRef.current++;
      } else {
        framesYawningRef.current = 0;
      }

      let newStatus: DetectionStatus = 'alert';

      if (
        framesEyesClosedRef.current >= settings.earConsecFrames ||
        framesYawningRef.current >= settings.marConsecFrames
      ) {
        newStatus = 'critical';
      } else if (
        framesEyesClosedRef.current >= settings.earConsecFrames / 2 ||
        framesYawningRef.current >= settings.marConsecFrames / 2
      ) {
        newStatus = 'drowsy';
      }

      setStatus(newStatus);

      if (newStatus === 'critical') {
        setShowAlert(true);
        if (!isMuted && audioAlarmRef.current && !audioAlarmRef.current.getIsPlaying()) {
          audioAlarmRef.current.play();
        }
      } else {
        setShowAlert(false);
        if (audioAlarmRef.current && audioAlarmRef.current.getIsPlaying()) {
          audioAlarmRef.current.stop();
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(runDetection);
  }, [video, settings, isCalibrating, isMuted]);

  useEffect(() => {
    if (video && !isModelLoading) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [video, isModelLoading, runDetection]);

  const handleCalibrate = () => {
    setIsCalibrating(true);
    calibrationDataRef.current = { ear: [], mar: [] };
    framesEyesClosedRef.current = 0;
    framesYawningRef.current = 0;
    setStatus('alert');
    setShowAlert(false);
    if (audioAlarmRef.current) {
      audioAlarmRef.current.stop();
    }

    const calibrationInterval = setInterval(() => {
      if (ear > 0 && mar > 0) {
        calibrationDataRef.current.ear.push(ear);
        calibrationDataRef.current.mar.push(mar);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(calibrationInterval);
    }, 3000);
  };

  const handleCalibrationComplete = () => {
    const { ear: earValues, mar: marValues } = calibrationDataRef.current;

    if (earValues.length > 0 && marValues.length > 0) {
      const avgEar = earValues.reduce((a, b) => a + b, 0) / earValues.length;
      const avgMar = marValues.reduce((a, b) => a + b, 0) / marValues.length;

      setSettings({
        ...settings,
        earThreshold: Math.max(0.15, avgEar * 0.8),
        marThreshold: Math.min(0.8, avgMar * 1.5),
      });
    }

    setIsCalibrating(false);
  };

  const handleSnooze = () => {
    setShowAlert(false);
    if (audioAlarmRef.current) {
      audioAlarmRef.current.stop();
    }
    framesEyesClosedRef.current = 0;
    framesYawningRef.current = 0;
    setStatus('alert');
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    framesEyesClosedRef.current = 0;
    framesYawningRef.current = 0;
    setStatus('alert');
    setShowAlert(false);
    if (audioAlarmRef.current) {
      audioAlarmRef.current.stop();
    }
  };

  const handleVideoReady = (videoElement: HTMLVideoElement) => {
    setVideo(videoElement);
    setCameraError(false);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Driver Drowsiness Detection
          </h1>
          <p className="text-muted-foreground">
            Stay alert, stay safe - Real-time drowsiness monitoring
          </p>
        </div>

        {isModelLoading && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground">Loading AI model...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {cameraError && (
          <Card className="border-destructive">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p>Camera access denied. Please allow camera permissions and reload.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <CameraFeed
              onVideoReady={handleVideoReady}
              status={status}
              isCalibrating={isCalibrating}
            />
          </div>

          <div className="space-y-6">
            <StatusDashboard
              status={status}
              ear={ear}
              mar={mar}
              fps={fps}
              showDebug={showDebug}
            />

            <SettingsPanel
              settings={settings}
              onSettingsChange={setSettings}
              onCalibrate={handleCalibrate}
              isMuted={isMuted}
              onToggleMute={() => setIsMuted(!isMuted)}
              onReset={handleReset}
            />
          </div>
        </div>

        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground text-center">
              <strong>Privacy Notice:</strong> All processing happens locally in your browser.
              No video data is transmitted or stored.
            </p>
          </CardContent>
        </Card>
      </div>

      {showAlert && <AlertOverlay onSnooze={handleSnooze} />}

      <CalibrationModal
        isOpen={isCalibrating}
        onComplete={handleCalibrationComplete}
        duration={3000}
      />

      <DebugToggle showDebug={showDebug} onToggle={() => setShowDebug(!showDebug)} />
    </div>
  );
}

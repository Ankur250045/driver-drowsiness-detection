import { useEffect, useRef, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import { Camera, CameraOff, Loader2, ScanFace } from 'lucide-react';
import type { DetectionStatus, Point3 } from '@/types';
import type { CameraState } from '@/hooks/useCamera';
import { LEFT_EYE, RIGHT_EYE, MOUTH_CORNERS, MOUTH_VERTICAL } from '@/services/featureExtraction';
import { cn } from '@/lib/utils';

// Contours for the overlay (MediaPipe Face Mesh topology).
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const RIGHT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];
const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];
const IRISES = [468, 473];

const STATUS_RGB: Record<DetectionStatus, string> = {
  'no-face': '148, 163, 184',
  alert: '34, 211, 238',
  drowsy: '250, 204, 21',
  critical: '248, 113, 113',
};

interface CameraFeedProps {
  videoRef: RefObject<HTMLVideoElement>;
  cameraState: CameraState;
  landmarksRef: MutableRefObject<Point3[] | null>;
  status: DetectionStatus;
  showMesh: boolean;
  modelLoading: boolean;
  overlay?: ReactNode;
  hud?: ReactNode;
}

export function CameraFeed({
  videoRef,
  cameraState,
  landmarksRef,
  status,
  showMesh,
  modelLoading,
  overlay,
  hud,
}: CameraFeedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const showMeshRef = useRef(showMesh);
  showMeshRef.current = showMesh;

  // Independent render loop for the landmark overlay.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && video && ctx && video.videoWidth) {
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const lm = landmarksRef.current;
        if (lm && showMeshRef.current) drawOverlay(ctx, lm, STATUS_RGB[statusRef.current]);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, landmarksRef]);

  const ring =
    status === 'critical'
      ? 'ring-red-500/80 shadow-[0_0_48px_-6px_rgba(248,113,113,0.7)]'
      : status === 'drowsy'
        ? 'ring-yellow-400/60'
        : status === 'alert'
          ? 'ring-cyan-400/40'
          : 'ring-border';

  return (
    <div
      className={cn(
        'relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black ring-2 transition-all duration-300',
        ring,
      )}
      data-testid="camera-feed"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover"
      />

      <div className="pointer-events-none absolute inset-4">
        {[
          'left-0 top-0 border-l-2 border-t-2',
          'right-0 top-0 border-r-2 border-t-2',
          'bottom-0 left-0 border-b-2 border-l-2',
          'bottom-0 right-0 border-b-2 border-r-2',
        ].map((c) => (
          <span key={c} className={cn('absolute h-6 w-6 rounded-sm border-cyan-300/50', c)} />
        ))}
      </div>

      {hud && <div className="pointer-events-none absolute inset-x-0 top-0 p-3">{hud}</div>}

      {(cameraState !== 'live' || modelLoading) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="space-y-3 px-6 text-center text-sm text-slate-300">
            {cameraState === 'denied' ? (
              <>
                <CameraOff className="mx-auto h-10 w-10 text-red-400" />
                <p className="font-medium text-red-300">Camera permission denied</p>
                <p className="text-slate-400">Allow camera access in your browser and reload.</p>
              </>
            ) : cameraState === 'unavailable' ? (
              <>
                <CameraOff className="mx-auto h-10 w-10 text-red-400" />
                <p>No camera available (requires HTTPS or localhost).</p>
              </>
            ) : cameraState === 'idle' ? (
              <>
                <Camera className="mx-auto h-10 w-10 text-cyan-300" />
                <p>Camera is off</p>
              </>
            ) : (
              <>
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-cyan-300" />
                <p>
                  {modelLoading
                    ? 'Loading Face Mesh model (~10 MB, first run only)…'
                    : 'Starting camera…'}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {cameraState === 'live' && !modelLoading && status === 'no-face' && !overlay && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm text-slate-300">
            <ScanFace className="h-4 w-4" /> Searching for face…
          </div>
        </div>
      )}

      {overlay}
    </div>
  );
}

function drawOverlay(ctx: CanvasRenderingContext2D, lm: Point3[], rgb: string) {
  const path = (idx: readonly number[]) => {
    ctx.beginPath();
    idx.forEach((i, k) => (k ? ctx.lineTo(lm[i].x, lm[i].y) : ctx.moveTo(lm[i].x, lm[i].y)));
    ctx.stroke();
  };

  ctx.fillStyle = `rgba(${rgb}, 0.35)`;
  for (let i = 0; i < 468; i += 3) ctx.fillRect(lm[i].x - 0.75, lm[i].y - 0.75, 1.5, 1.5);

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = `rgba(${rgb}, 0.45)`;
  path(FACE_OVAL);

  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
  path(LEFT_EYE_CONTOUR);
  path(RIGHT_EYE_CONTOUR);
  path(LIPS_INNER);

  // EAR / MAR measurement segments
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  for (const eye of [LEFT_EYE, RIGHT_EYE]) {
    path([eye[1], eye[5]]);
    path([eye[2], eye[4]]);
    path([eye[0], eye[3]]);
  }
  for (const pair of MOUTH_VERTICAL) path(pair);
  path(MOUTH_CORNERS);

  if (lm.length > 473) {
    ctx.fillStyle = `rgba(${rgb}, 1)`;
    for (const i of IRISES) {
      ctx.beginPath();
      ctx.arc(lm[i].x, lm[i].y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'idle' | 'starting' | 'live' | 'denied' | 'unavailable';

/** Starts the user-facing webcam and returns the playing <video> element once ready. */
export function useCamera(enabled: boolean) {
  const [state, setState] = useState<CameraState>('idle');
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setVideo(null);
    setState('idle');
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable');
        return;
      }
      setState('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const el = videoElRef.current;
        if (!el) return;
        el.srcObject = stream;
        el.onloadedmetadata = async () => {
          await el.play().catch(() => undefined);
          if (!cancelled) {
            setVideo(el);
            setState('live');
          }
        };
      } catch (err) {
        console.error('Camera error:', err);
        if (!cancelled) {
          const name = (err as DOMException)?.name;
          setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
        }
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, stop]);

  return { state, video, videoRef: videoElRef };
}

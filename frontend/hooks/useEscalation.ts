import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AlertSettings, type EscalationResult } from '@/services/api';
import { useBackend } from '@/hooks/useBackend';

/** If no on-device channel (sound / vibration) works, don't wait the full delay. */
const FAST_ESCALATION_SECONDS = 3;

export type EscalationPhase = 'unavailable' | 'idle' | 'countdown' | 'calling' | 'done' | 'failed';

interface Params {
  alarmActive: boolean;
  /** performance.now() when the current alarm started (0 = none) */
  alarmSince: number;
  audioOk: boolean;
  hapticsOk: boolean;
  reason: string;
  probability: number;
  closureSeconds: number;
}

/**
 * Escalation ladder: on-screen alarm → sound + vibration → phone call.
 * If the driver hasn't acknowledged the alarm after `escalation_delay_seconds`
 * (or after 3 s when neither sound nor vibration is working), the backend
 * places a phone call to the driver (and texts the emergency contact).
 * An incoming call uses the phone's own ringtone/vibration, which works even
 * when the browser tab is muted or Web Audio is blocked.
 */
export function useEscalation(p: Params) {
  const { online, user } = useBackend();
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [phase, setPhase] = useState<EscalationPhase>('unavailable');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<EscalationResult | null>(null);
  const firedForRef = useRef(0); // alarmSince of the episode we already escalated

  const reload = useCallback(async () => {
    if (!online || !user) {
      setSettings(null);
      return;
    }
    try {
      setSettings(await api.alertSettings());
    } catch {
      setSettings(null);
    }
  }, [online, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const enabled = !!settings?.escalation_enabled && !!settings.phone_number;
  const delay = settings
    ? p.audioOk || p.hapticsOk
      ? settings.escalation_delay_seconds
      : Math.min(settings.escalation_delay_seconds, FAST_ESCALATION_SECONDS)
    : 0;

  // Latest values for the timer without re-arming it on every render.
  const latest = useRef(p);
  latest.current = p;

  useEffect(() => {
    if (!enabled) {
      setPhase('unavailable');
      return;
    }
    if (!p.alarmActive) {
      setPhase('idle');
      setResult(null);
      return;
    }
    if (!p.alarmSince || firedForRef.current === p.alarmSince) return;

    setPhase('countdown');
    const timer = setInterval(async () => {
      const elapsed = (performance.now() - p.alarmSince) / 1000;
      const left = Math.max(0, delay - elapsed);
      setSecondsLeft(Math.ceil(left));
      if (left > 0 || firedForRef.current === p.alarmSince) return;

      firedForRef.current = p.alarmSince;
      clearInterval(timer);
      setPhase('calling');
      try {
        const { reason, probability, closureSeconds } = latest.current;
        const res = await api.escalate({ reason, probability, closure_seconds: closureSeconds });
        setResult(res);
        setPhase(res.status === 'failed' ? 'failed' : 'done');
      } catch (e) {
        setResult({ status: 'failed', call_sid: null, sms_sid: null, message: String(e) });
        setPhase('failed');
      }
    }, 250);
    return () => clearInterval(timer);
  }, [enabled, p.alarmActive, p.alarmSince, delay]);

  return { settings, reload, enabled, phase, secondsLeft, delay, result };
}

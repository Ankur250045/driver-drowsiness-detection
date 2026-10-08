import { AlertTriangle, Check, PhoneCall, PhoneOff, Smartphone, Vibrate, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EscalationPhase } from '@/hooks/useEscalation';
import type { EscalationResult } from '@/services/api';
import { cn } from '@/lib/utils';

interface AlertOverlayProps {
  reason: string;
  onAcknowledge: () => void;
  channels: { audio: boolean; haptics: boolean };
  escalation: {
    phase: EscalationPhase;
    secondsLeft: number;
    result: EscalationResult | null;
    phone: string | null;
  };
}

export function maskPhone(phone: string | null) {
  if (!phone) return '';
  return phone.length > 4 ? `${phone.slice(0, 3)}•••••${phone.slice(-3)}` : phone;
}

function Channel({ icon: Icon, label, ok, pending }: { icon: typeof Volume2; label: string; ok: boolean; pending?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', ok ? 'bg-white/15 text-white' : pending ? 'bg-yellow-300/15 text-yellow-100' : 'bg-black/30 text-red-200/80')}>
      <Icon className="h-4 w-4" />
      {label}
      {ok ? <Check className="ml-auto h-4 w-4" /> : pending ? null : <X className="ml-auto h-4 w-4" />}
    </div>
  );
}

export function AlertOverlay({ reason, onAcknowledge, channels, escalation }: AlertOverlayProps) {
  const { phase, secondsLeft, result, phone } = escalation;

  let callLabel: string;
  let callOk = false;
  let callPending = false;
  if (phase === 'unavailable') callLabel = 'Phone call: not set up';
  else if (phase === 'countdown') {
    callLabel = `Calling ${maskPhone(phone)} in ${secondsLeft}s`;
    callPending = true;
  } else if (phase === 'calling') {
    callLabel = `Calling ${maskPhone(phone)}…`;
    callPending = true;
  } else if (phase === 'done') {
    callOk = true;
    callLabel = result?.status === 'simulated' ? 'Call simulated (Twilio not configured)' : result?.status === 'cooldown' ? 'Called recently' : `Calling ${maskPhone(phone)}`;
  } else if (phase === 'failed') callLabel = 'Call failed';
  else callLabel = 'Phone call: armed';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/85 backdrop-blur-sm"
      role="alertdialog"
      aria-labelledby="alert-title"
      data-testid="alert-overlay"
    >
      <div className="pointer-events-none absolute inset-0 animate-pulse bg-red-600/20" />
      <div className="relative w-full max-w-lg space-y-6 p-8 text-center">
        <AlertTriangle className="mx-auto h-20 w-20 animate-pulse text-red-300" />
        <div className="space-y-2">
          <h1 id="alert-title" className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            DROWSINESS DETECTED
          </h1>
          <p className="text-lg text-red-100/90 md:text-xl">{reason}</p>
          <p className="text-sm text-red-200/70">Please pull over safely and take a break.</p>
        </div>

        <div className="grid gap-2 text-left sm:grid-cols-3">
          <Channel icon={Volume2} label="Sound" ok={channels.audio} />
          <Channel icon={Vibrate} label="Vibration" ok={channels.haptics} />
          <Channel icon={phase === 'failed' || phase === 'unavailable' ? PhoneOff : PhoneCall} label="Phone" ok={callOk} pending={callPending} />
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-red-100/90">
          <Smartphone className="h-4 w-4" /> {callLabel}
        </div>

        <Button size="lg" onClick={onAcknowledge} className="bg-white text-red-700 hover:bg-red-50" data-testid="button-snooze">
          I'm awake — acknowledge
        </Button>
      </div>
    </div>
  );
}

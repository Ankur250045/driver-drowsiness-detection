import { AlertTriangle, EyeOff, Laugh, MoveDown, TrendingUp } from 'lucide-react';
import type { DrowsinessEvent } from '@/types';
import { cn } from '@/lib/utils';

const META: Record<DrowsinessEvent['type'], { icon: typeof EyeOff; color: string }> = {
  microsleep: { icon: EyeOff, color: 'text-red-400 bg-red-400/10' },
  critical: { icon: AlertTriangle, color: 'text-red-400 bg-red-400/10' },
  drowsy: { icon: TrendingUp, color: 'text-yellow-300 bg-yellow-300/10' },
  yawn: { icon: Laugh, color: 'text-violet-300 bg-violet-300/10' },
  'head-nod': { icon: MoveDown, color: 'text-orange-300 bg-orange-300/10' },
};

export function formatClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function EventLog({ events }: { events: DrowsinessEvent[] }) {
  if (!events.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No events yet — stay safe!</p>;
  }
  return (
    <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
      {events.map((e, i) => {
        const { icon: Icon, color } = META[e.type];
        return (
          <li key={`${e.t}-${i}`} className="flex items-center gap-2.5 rounded-lg bg-background/50 px-2.5 py-1.5 text-xs">
            <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', color)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 truncate">{e.detail}</span>
            <span className="font-mono text-muted-foreground">{formatClock(e.t)}</span>
          </li>
        );
      })}
    </ul>
  );
}

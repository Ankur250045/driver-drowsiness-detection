import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricTileProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  /** 0–1, renders a thin progress bar */
  level?: number;
}

const TONE = {
  default: 'text-foreground',
  good: 'text-cyan-300',
  warn: 'text-yellow-300',
  bad: 'text-red-400',
};

const BAR = {
  default: 'bg-primary',
  good: 'bg-cyan-400',
  warn: 'bg-yellow-400',
  bad: 'bg-red-400',
};

export function MetricTile({ label, value, unit, hint, icon: Icon, tone = 'default', level }: MetricTileProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className={cn('mt-1.5 font-mono text-xl font-semibold tabular', TONE[tone])}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
      {level !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all duration-200', BAR[tone])}
            style={{ width: `${Math.max(0, Math.min(1, level)) * 100}%` }}
          />
        </div>
      )}
      {hint && <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

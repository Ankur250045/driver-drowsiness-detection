import type { DetectionStatus } from '@/types';

const LABEL: Record<DetectionStatus, string> = {
  'no-face': 'No face',
  alert: 'Alert',
  drowsy: 'Drowsy',
  critical: 'Critical',
};

const COLOR: Record<DetectionStatus, string> = {
  'no-face': '#64748b',
  alert: '#22d3ee',
  drowsy: '#facc15',
  critical: '#f87171',
};

/** Semi-circular gauge showing the smoothed drowsiness probability. */
export function RiskGauge({ probability, status }: { probability: number; status: DetectionStatus }) {
  const r = 80;
  const circumference = Math.PI * r;
  const p = status === 'no-face' ? 0 : Math.max(0, Math.min(1, probability));
  const color = COLOR[status];

  return (
    <div className="flex flex-col items-center" data-testid="risk-gauge">
      <svg viewBox="0 0 200 116" className="w-full max-w-[240px]">
        <defs>
          <linearGradient id="gauge-track" x1="0" x2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
            <stop offset="55%" stopColor="#facc15" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#f87171" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gauge-track)" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${circumference * p} ${circumference}`}
          style={{ transition: 'stroke-dasharray 200ms linear, stroke 300ms', filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
        <text x="100" y="86" textAnchor="middle" className="fill-foreground" style={{ fontSize: 34, fontWeight: 800 }}>
          {status === 'no-face' ? '—' : `${Math.round(p * 100)}%`}
        </text>
        <text x="100" y="108" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10, letterSpacing: 2 }}>
          DROWSINESS RISK
        </text>
      </svg>
      <div
        className="mt-1 rounded-full px-3 py-1 text-sm font-semibold"
        style={{ color, backgroundColor: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}40` }}
        data-testid="text-status"
      >
        {LABEL[status]}
      </div>
    </div>
  );
}

import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimelinePoint } from '@/types';

const axis = { stroke: 'hsl(var(--muted-foreground))', fontSize: 10, tickLine: false, axisLine: false };
const tooltipStyle = {
  contentStyle: {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
  },
  labelFormatter: (t: number) => `t = ${Number(t).toFixed(1)} s`,
};

export function ProbabilityChart({
  data,
  drowsy,
  critical,
}: {
  data: TimelinePoint[];
  drowsy: number;
  critical: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="prob-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.5} />
            <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => `${Math.round(t)}s`} {...axis} />
        <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} {...axis} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => [v.toFixed(3), 'P(drowsy)']} />
        <ReferenceLine y={drowsy} stroke="#facc15" strokeDasharray="4 4" strokeOpacity={0.6} />
        <ReferenceLine y={critical} stroke="#f87171" strokeDasharray="4 4" strokeOpacity={0.6} />
        <Area
          type="monotone"
          dataKey="probability"
          stroke="hsl(var(--chart-2))"
          strokeWidth={2}
          fill="url(#prob-fill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SignalsChart({ data, earThreshold, marThreshold }: { data: TimelinePoint[]; earThreshold: number; marThreshold: number }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => `${Math.round(t)}s`} {...axis} />
        <YAxis domain={[0, 'auto']} {...axis} />
        <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [v.toFixed(3), name.toUpperCase()]} />
        <ReferenceLine y={earThreshold} stroke="hsl(var(--chart-1))" strokeDasharray="4 4" strokeOpacity={0.5} />
        <ReferenceLine y={marThreshold} stroke="hsl(var(--chart-3))" strokeDasharray="4 4" strokeOpacity={0.5} />
        <Line type="monotone" dataKey="ear" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="mar" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="perclos" stroke="hsl(var(--chart-4))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4"
            style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

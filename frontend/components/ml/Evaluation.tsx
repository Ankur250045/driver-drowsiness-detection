import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ModelMetrics } from '@/types';
import type { EpochLog } from '@/services/trainer';

export function ConfusionMatrix({ matrix, labels = ['Alert', 'Drowsy'] }: { matrix: number[][]; labels?: string[] }) {
  const total = matrix.flat().reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...matrix.flat(), 1);
  return (
    <div className="inline-grid grid-cols-[auto_repeat(2,minmax(72px,1fr))] gap-1 text-xs">
      <div />
      {labels.map((l) => (
        <div key={l} className="pb-1 text-center text-muted-foreground">
          pred {l}
        </div>
      ))}
      {matrix.map((row, i) => (
        <div key={i} className="contents">
          <div className="flex items-center pr-2 text-muted-foreground">true {labels[i]}</div>
          {row.map((v, j) => (
            <div
              key={j}
              className="flex flex-col items-center justify-center rounded-md py-3"
              style={{
                background: i === j ? `rgba(34, 211, 238, ${0.12 + 0.5 * (v / max)})` : `rgba(248, 113, 113, ${0.08 + 0.5 * (v / max)})`,
              }}
            >
              <span className="font-mono text-base font-semibold">{v}</span>
              <span className="text-[10px] text-muted-foreground">{((v / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function MetricsGrid({ metrics }: { metrics: ModelMetrics }) {
  const items: [string, number | undefined][] = [
    ['Accuracy', metrics.accuracy],
    ['Precision', metrics.precision],
    ['Recall', metrics.recall],
    ['F1-score', metrics.f1],
    ['ROC-AUC', metrics.roc_auc],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-border bg-background/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular">
            {v === undefined || Number.isNaN(v) ? '—' : v.toFixed(3)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrainingCurves({ history }: { history: EpochLog[] }) {
  const axis = { stroke: 'hsl(var(--muted-foreground))', fontSize: 10, tickLine: false, axisLine: false };
  const tooltip = {
    contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 },
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Binary cross-entropy loss</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={history} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="epoch" {...axis} />
            <YAxis {...axis} />
            <Tooltip {...tooltip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="loss" name="train" stroke="hsl(var(--chart-1))" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line dataKey="valLoss" name="validation" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Accuracy</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={history} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="epoch" {...axis} />
            <YAxis domain={[0, 1]} {...axis} />
            <Tooltip {...tooltip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="acc" name="train" stroke="hsl(var(--chart-1))" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line dataKey="valAcc" name="validation" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

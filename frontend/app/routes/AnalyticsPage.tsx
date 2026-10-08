import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, BarChart3, Clock, CloudUpload, EyeOff, History, Laugh, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Panel } from '@/components/layout/Panel';
import { MetricTile } from '@/components/monitor/MetricTile';
import { EventLog } from '@/components/monitor/EventLog';
import { Button } from '@/components/ui/button';
import { sessionStore } from '@/services/storage';
import { api, type AnalyticsSummary } from '@/services/api';
import { useBackend } from '@/hooks/useBackend';
import type { SessionSummary } from '@/types';
import { cn } from '@/lib/utils';

const axis = { stroke: 'hsl(var(--muted-foreground))', fontSize: 10, tickLine: false, axisLine: false };
const tooltip = { contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 } };

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  return m ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
}

export default function AnalyticsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>(() => sessionStore.list());
  const [selectedId, setSelectedId] = useState<string | null>(sessions[0]?.id ?? null);
  const [server, setServer] = useState<AnalyticsSummary | null>(null);
  const { user } = useBackend();

  useEffect(() => {
    if (user) api.analyticsSummary().then(setServer).catch(() => setServer(null));
  }, [user]);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  const totals = useMemo(() => {
    const dur = sessions.reduce((a, s) => a + s.durationSeconds, 0);
    return {
      count: sessions.length,
      minutes: dur / 60,
      avgRisk: dur ? sessions.reduce((a, s) => a + s.avgProbability * s.durationSeconds, 0) / dur : 0,
      microsleeps: sessions.reduce((a, s) => a + s.microsleeps, 0),
      alerts: sessions.reduce((a, s) => a + s.alerts, 0),
      yawns: sessions.reduce((a, s) => a + s.totalYawns, 0),
    };
  }, [sessions]);

  const perSession = sessions
    .slice()
    .reverse()
    .map((s, i) => ({
      name: `#${i + 1}`,
      avg: Number(s.avgProbability.toFixed(3)),
      max: Number(s.maxProbability.toFixed(3)),
      perclos: Number((s.avgPerclos * 100).toFixed(1)),
    }));

  if (!sessions.length) {
    return (
      <>
        <PageHeader eyebrow="Insights" title="Analytics" description="Session history and fatigue trends." />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No sessions recorded yet</p>
            <p className="text-sm text-muted-foreground">Start a session in the Live Monitor and stop it to save a report here.</p>
          </div>
          <Button asChild>
            <Link href="/monitor">Open Live Monitor</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Fatigue trends across your recorded sessions. Session reports are stored locally and synced to the backend when you are signed in."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              sessionStore.clear();
              setSessions([]);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Clear local history
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile icon={History} label="Sessions" value={String(totals.count)} />
        <MetricTile icon={Clock} label="Monitored" value={totals.minutes.toFixed(1)} unit="min" />
        <MetricTile icon={Activity} label="Avg risk" value={(totals.avgRisk * 100).toFixed(1)} unit="%" tone={totals.avgRisk > 0.5 ? 'bad' : totals.avgRisk > 0.3 ? 'warn' : 'good'} />
        <MetricTile icon={EyeOff} label="Microsleeps" value={String(totals.microsleeps)} tone={totals.microsleeps ? 'bad' : 'good'} />
        <MetricTile icon={AlertTriangle} label="Alarms" value={String(totals.alerts)} tone={totals.alerts ? 'warn' : 'good'} />
        <MetricTile icon={Laugh} label="Yawns" value={String(totals.yawns)} />
      </div>

      {server && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <CloudUpload className="h-4 w-4 text-emerald-400" />
          Server: {server.total_sessions} sessions · {server.total_drive_minutes.toFixed(1)} min · {server.total_microsleeps} microsleeps across all your devices.
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Risk per session" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={perSession} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis domain={[0, 1]} {...axis} />
              <Tooltip {...tooltip} />
              <Bar dataKey="avg" name="mean P(drowsy)" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="max" name="peak P(drowsy)" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Mean PERCLOS per session (%)" icon={EyeOff}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={perSession} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tooltip} />
              <Bar dataKey="perclos" name="PERCLOS %" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel title="Sessions" icon={History} bodyClassName="p-2">
          <ul className="max-h-[480px] space-y-1 overflow-y-auto">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    'w-full rounded-lg px-3 py-2 text-left text-xs transition-colors',
                    s.id === selectedId ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-accent',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{new Date(s.startedAt).toLocaleString()}</span>
                    {s.synced && <CloudUpload className="h-3.5 w-3.5 text-emerald-400" />}
                  </div>
                  <div className="mt-0.5 flex gap-3 text-muted-foreground">
                    <span>{fmtDuration(s.durationSeconds)}</span>
                    <span>risk {(s.avgProbability * 100).toFixed(0)}%</span>
                    <span className={s.alerts ? 'text-red-300' : ''}>{s.alerts} alarms</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        {selected && (
          <Panel title={`Session report — ${new Date(selected.startedAt).toLocaleString()}`} icon={Activity}>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                {[
                  ['Duration', fmtDuration(selected.durationSeconds)],
                  ['Peak risk', `${(selected.maxProbability * 100).toFixed(0)}%`],
                  ['Blinks', selected.totalBlinks],
                  ['Model', selected.modelVersion],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg bg-background/50 p-2.5">
                    <div className="text-muted-foreground">{k}</div>
                    <div className="mt-0.5 truncate font-medium">{v}</div>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={selected.timeline} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sess-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => `${Math.round(t)}s`} {...axis} />
                  <YAxis domain={[0, 1]} {...axis} />
                  <Tooltip {...tooltip} labelFormatter={(t) => `t = ${Number(t).toFixed(0)} s`} />
                  <Area dataKey="probability" name="P(drowsy)" stroke="hsl(var(--chart-2))" fill="url(#sess-fill)" strokeWidth={2} isAnimationActive={false} />
                  <Area dataKey="perclos" name="PERCLOS" stroke="hsl(var(--chart-4))" fill="none" strokeWidth={1.5} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Events</h3>
                <EventLog events={selected.events} />
              </div>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}

import { useState } from 'react';
import { Link } from 'wouter';
import {
  Activity,
  BrainCircuit,
  Cpu,
  Eye,
  Gauge,
  History,
  Laugh,
  ListChecks,
  MoveVertical,
  PhoneCall,
  Play,
  ScanEye,
  SlidersHorizontal,
  Square,
  Timer,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Panel } from '@/components/layout/Panel';
import { CameraFeed } from '@/components/CameraFeed';
import { AlertOverlay } from '@/components/AlertOverlay';
import { RiskGauge } from '@/components/monitor/RiskGauge';
import { MetricTile } from '@/components/monitor/MetricTile';
import { Legend, ProbabilityChart, SignalsChart } from '@/components/monitor/LiveCharts';
import { FeatureContributions } from '@/components/monitor/FeatureContributions';
import { EventLog } from '@/components/monitor/EventLog';
import { ControlPanel } from '@/components/monitor/ControlPanel';
import { EmergencyPanel } from '@/components/monitor/EmergencyPanel';
import { useEscalation } from '@/hooks/useEscalation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useCamera } from '@/hooks/useCamera';
import { useDrowsinessEngine } from '@/hooks/useDrowsinessEngine';
import { useBackend } from '@/hooks/useBackend';
import { useToast } from '@/hooks/use-toast';
import { sessionStore } from '@/services/storage';
import { api } from '@/services/api';
import { cn } from '@/lib/utils';

export default function MonitorPage() {
  const camera = useCamera(true);
  const engine = useDrowsinessEngine({ video: camera.video });
  const { user } = useBackend();
  const { toast } = useToast();
  const [showMesh, setShowMesh] = useState(true);
  const { live, settings, model } = engine;

  const toggleSession = async () => {
    if (!engine.session.active) {
      engine.session.start();
      toast({ title: 'Session started', description: 'Metrics are now being recorded.' });
      return;
    }
    const summary = engine.session.stop();
    if (!summary) return;
    if (user) {
      try {
        await api.saveSession(summary);
        summary.synced = true;
      } catch (e) {
        console.warn('Session sync failed', e);
      }
    }
    sessionStore.save(summary);
    toast({
      title: 'Session saved',
      description: `${Math.round(summary.durationSeconds)} s · ${summary.alerts} alerts · ${summary.microsleeps} microsleeps${summary.synced ? ' · synced to server' : ''}`,
    });
  };

  const modelLoading = engine.stage === 'loading-model';
  const ear = live.ear;
  const earTone = live.status === 'no-face' ? 'default' : ear < settings.earThreshold ? 'bad' : 'good';
  const perclos = live.features?.perclos ?? 0;

  const alertReason =
    live.closureSeconds >= settings.microsleepSeconds
      ? `Eyes closed for ${live.closureSeconds.toFixed(1)} s (microsleep)`
      : `Model confidence ${(live.probability * 100).toFixed(0)}% drowsy`;

  const escalation = useEscalation({
    alarmActive: engine.alarmActive,
    alarmSince: engine.alarmInfo.since,
    audioOk: engine.alarmInfo.audio,
    hapticsOk: engine.alarmInfo.haptics,
    reason: alertReason,
    probability: live.probability,
    closureSeconds: live.closureSeconds,
  });

  const hud = (
    <div className="flex items-start justify-between gap-2 font-mono text-[11px]">
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded bg-black/60 px-2 py-1 text-cyan-300">{live.fps.toFixed(0)} FPS</span>
        <span className="rounded bg-black/60 px-2 py-1 text-slate-300">{live.inferenceMs.toFixed(1)} ms</span>
        {engine.backend && <span className="rounded bg-black/60 px-2 py-1 uppercase text-slate-300">{engine.backend}</span>}
      </div>
      {engine.session.active && (
        <span className="flex items-center gap-1.5 rounded bg-red-500/80 px-2 py-1 font-semibold text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> REC
        </span>
      )}
    </div>
  );

  const calibrationOverlay = engine.calibration.active ? (
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5 pt-12">
      <p className="mb-2 text-sm font-medium text-white">Calibrating — look at the camera with eyes normally open</p>
      <Progress value={engine.calibration.progress * 100} className="h-1.5" />
    </div>
  ) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Real-time inference"
        title="Live Monitor"
        description="MediaPipe Face Mesh → per-frame geometry → 10-second temporal features → ML classifier → alert state machine. Everything runs on-device; no video leaves your browser."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={engine.calibrate} disabled={modelLoading || engine.calibration.active}>
              <ScanEye className="mr-2 h-4 w-4" /> Calibrate
            </Button>
            <Button
              size="sm"
              onClick={toggleSession}
              disabled={modelLoading}
              className={cn(engine.session.active && 'bg-red-500 text-white hover:bg-red-600')}
              data-testid="button-session"
            >
              {engine.session.active ? <Square className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {engine.session.active ? 'Stop & save session' : 'Start session'}
            </Button>
          </>
        }
      />

      {engine.stage === 'error' && (
        <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          Failed to initialise the ML pipeline: {engine.error}. Check your internet connection (the Face Mesh model loads from a CDN) and reload.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <CameraFeed
            videoRef={camera.videoRef}
            cameraState={camera.state}
            landmarksRef={engine.landmarksRef}
            status={live.status}
            showMesh={showMesh}
            modelLoading={modelLoading}
            hud={camera.state === 'live' && !modelLoading ? hud : undefined}
            overlay={calibrationOverlay}
          />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricTile icon={Eye} label="EAR" value={ear.toFixed(3)} tone={earTone} level={ear / 0.4} hint={`L ${live.earLeft.toFixed(2)} · R ${live.earRight.toFixed(2)}`} />
            <MetricTile icon={Laugh} label="MAR" value={live.mar.toFixed(3)} tone={live.mar > settings.marThreshold ? 'warn' : 'default'} level={live.mar} hint={`${live.yawns} yawns`} />
            <MetricTile icon={Timer} label="PERCLOS" value={(perclos * 100).toFixed(1)} unit="%" tone={perclos > 0.15 ? 'bad' : perclos > 0.08 ? 'warn' : 'good'} level={perclos / 0.4} hint="eyes-closed share, 10 s" />
            <MetricTile icon={MoveVertical} label="Head pose" value={`${live.pose.pitch.toFixed(0)}°`} tone={live.pose.pitch > 20 ? 'warn' : 'default'} hint={`yaw ${live.pose.yaw.toFixed(0)}° · roll ${live.pose.roll.toFixed(0)}°`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Drowsiness probability" icon={Activity}>
              <ProbabilityChart data={live.timeline} drowsy={settings.drowsyProbability} critical={settings.criticalProbability} />
              <Legend
                items={[
                  { label: 'P(drowsy), EMA-smoothed', color: 'hsl(var(--chart-2))' },
                  { label: 'drowsy', color: '#facc15', dashed: true },
                  { label: 'critical', color: '#f87171', dashed: true },
                ]}
              />
            </Panel>
            <Panel title="Facial signals" icon={Gauge}>
              <SignalsChart data={live.timeline} earThreshold={settings.earThreshold} marThreshold={settings.marThreshold} />
              <Legend
                items={[
                  { label: 'EAR', color: 'hsl(var(--chart-1))' },
                  { label: 'MAR', color: 'hsl(var(--chart-3))' },
                  { label: 'PERCLOS', color: 'hsl(var(--chart-4))' },
                ]}
              />
            </Panel>
          </div>
        </div>

        <div className="space-y-6">
          <Panel>
            <RiskGauge probability={live.probability} status={live.status} />
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {[
                ['Blinks', live.blinks],
                ['Yawns', live.yawns],
                ['Micro-sleeps', live.microsleeps],
                ['Alerts', live.alerts],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-background/60 py-2">
                  <div className="font-mono text-lg font-semibold tabular">{v}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
                </div>
              ))}
            </div>
            {model && (
              <Link href="/model" className="mt-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-accent">
                <BrainCircuit className="h-4 w-4 text-primary" />
                <span className="truncate">
                  {model.name} <span className="text-muted-foreground">v{model.version}</span>
                </span>
                <span
                  className={cn(
                    'ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                    model.trained ? 'bg-emerald-400/15 text-emerald-300' : 'bg-yellow-400/15 text-yellow-300',
                  )}
                >
                  {model.trained ? 'trained' : 'baseline'}
                </span>
              </Link>
            )}
          </Panel>

          <Panel title="Why this prediction?" icon={Cpu} actions={<span className="text-[10px] uppercase tracking-wider text-muted-foreground">occlusion XAI</span>}>
            <FeatureContributions features={live.features} contributions={live.prediction?.contributions ?? null} />
          </Panel>

          <Panel title="Event log" icon={History}>
            <EventLog events={live.events} />
          </Panel>

          <Panel
            title="Detection settings"
            icon={SlidersHorizontal}
            actions={
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Mesh <Switch checked={showMesh} onCheckedChange={setShowMesh} />
              </label>
            }
          >
            <ControlPanel
              settings={settings}
              onChange={engine.setSettings}
              onCalibrate={engine.calibrate}
              onReset={engine.resetSettings}
              muted={engine.muted}
              onToggleMute={() => engine.setMuted(!engine.muted)}
              calibrating={engine.calibration.active}
            />
          </Panel>

          <Panel
            title="Emergency call escalation"
            icon={PhoneCall}
            actions={
              escalation.enabled ? (
                <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">armed</span>
              ) : undefined
            }
          >
            <EmergencyPanel settings={escalation.settings} onSaved={escalation.reload} />
          </Panel>

          <Panel title="Pipeline" icon={ListChecks}>
            <ol className="space-y-2 text-xs text-muted-foreground">
              {[
                ['Face Mesh', '478 3D landmarks @ ~30 FPS (WebGL)'],
                ['Geometry', 'EAR, MAR, head pitch/yaw/roll per frame'],
                ['Temporal window', '10 s → 11 engineered features'],
                ['Classifier', `${model?.type === 'mlp' ? 'MLP' : 'Logistic regression'} → P(drowsy), EMA smoothed`],
                ['Decision', 'microsleep rule ∨ P ≥ critical → alarm'],
              ].map(([k, v], i) => (
                <li key={k} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-[10px] text-primary">{i + 1}</span>
                  <span>
                    <span className="font-medium text-foreground">{k}</span> — {v}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      {engine.alarmActive && (
        <AlertOverlay
          reason={alertReason}
          onAcknowledge={engine.acknowledge}
          channels={{ audio: engine.alarmInfo.audio, haptics: engine.alarmInfo.haptics }}
          escalation={{
            phase: escalation.phase,
            secondsLeft: escalation.secondsLeft,
            result: escalation.result,
            phone: escalation.settings?.phone_number ?? null,
          }}
        />
      )}
    </>
  );
}

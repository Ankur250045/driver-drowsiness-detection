import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BrainCircuit,
  CircleDot,
  CloudUpload,
  Database,
  Download,
  FlaskConical,
  Loader2,
  Rocket,
  Sparkles,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Panel } from '@/components/layout/Panel';
import { CameraFeed } from '@/components/CameraFeed';
import { ConfusionMatrix, MetricsGrid, TrainingCurves } from '@/components/ml/Evaluation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useCamera } from '@/hooks/useCamera';
import { useDrowsinessEngine } from '@/hooks/useDrowsinessEngine';
import { useBackend } from '@/hooks/useBackend';
import { useToast } from '@/hooks/use-toast';
import { downloadFile, sampleStore, samplesToCsv } from '@/services/storage';
import { generateSynthetic } from '@/services/syntheticData';
import { trainModel, type Architecture, type EpochLog } from '@/services/trainer';
import { loadBundledModel, saveCustomModel } from '@/services/classifier';
import { api } from '@/services/api';
import type { FeatureVector, LabeledSample, ModelArtifact } from '@/types';
import { cn } from '@/lib/utils';

export default function DataLabPage() {
  const [cameraOn, setCameraOn] = useState(false);
  const [samples, setSamples] = useState<LabeledSample[]>(() => sampleStore.list());
  const [recording, setRecording] = useState<0 | 1 | null>(null);
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  const [arch, setArch] = useState<Architecture>('mlp');
  const [epochs, setEpochs] = useState(60);
  const [lr, setLr] = useState(0.01);
  const [training, setTraining] = useState(false);
  const [history, setHistory] = useState<EpochLog[]>([]);
  const [trained, setTrained] = useState<ModelArtifact | null>(null);

  const { user } = useBackend();
  const { toast } = useToast();
  const camera = useCamera(cameraOn);

  const onSample = useCallback((features: FeatureVector, t: number) => {
    const label = recordingRef.current;
    if (label === null) return;
    setSamples((prev) => [...prev, { t, label, features }]);
  }, []);

  const engine = useDrowsinessEngine({ video: camera.video, onSample, alarmsEnabled: false });

  useEffect(() => {
    sampleStore.save(samples);
  }, [samples]);

  const counts = {
    alert: samples.filter((s) => s.label === 0).length,
    drowsy: samples.filter((s) => s.label === 1).length,
  };
  const canTrain = counts.alert >= 10 && counts.drowsy >= 10 && !training;

  const startTraining = async () => {
    setTraining(true);
    setHistory([]);
    setTrained(null);
    try {
      const model = await trainModel(samples, {
        architecture: arch,
        epochs,
        learningRate: lr,
        onEpoch: (log) => setHistory((h) => [...h, log]),
      });
      setTrained(model);
      toast({ title: 'Training complete', description: `Test accuracy ${(model.metrics?.accuracy ?? 0).toFixed(3)}` });
    } catch (e) {
      toast({ title: 'Training failed', description: String(e), variant: 'destructive' });
    } finally {
      setTraining(false);
    }
  };

  const deploy = () => {
    if (!trained) return;
    saveCustomModel(trained);
    engine.setModel(trained);
    toast({ title: 'Model deployed', description: 'The Live Monitor now uses your trained model.' });
  };

  const revert = async () => {
    saveCustomModel(null);
    engine.setModel(await loadBundledModel());
    toast({ title: 'Reverted', description: 'Using the bundled model again.' });
  };

  const upload = async () => {
    try {
      const res = await api.uploadSamples(samples);
      toast({ title: 'Uploaded', description: `${res.stored} samples stored on the server.` });
    } catch (e) {
      toast({ title: 'Upload failed', description: String(e), variant: 'destructive' });
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Data collection & training"
        title="Data Lab"
        description="Build a personalised dataset: record labelled 10-second feature windows while acting alert or drowsy, then train and evaluate a neural network in your browser with TensorFlow.js — or export the CSV to the Python pipeline in ml/."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Panel
            title="1 · Record labelled data"
            icon={CircleDot}
            actions={
              <Button size="sm" variant="outline" onClick={() => setCameraOn(!cameraOn)}>
                {cameraOn ? 'Stop camera' : 'Start camera'}
              </Button>
            }
          >
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
              <CameraFeed
                videoRef={camera.videoRef}
                cameraState={camera.state}
                landmarksRef={engine.landmarksRef}
                status={engine.live.status}
                showMesh
                modelLoading={cameraOn && engine.stage === 'loading-model'}
                hud={
                  recording !== null ? (
                    <span className={cn('inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] font-semibold text-white', recording ? 'bg-red-500/80' : 'bg-cyan-600/80')}>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> REC · {recording ? 'DROWSY' : 'ALERT'}
                    </span>
                  ) : undefined
                }
              />
              <div className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  One sample is captured per second (a sliding 10 s window). Record at least a minute of each class.
                  For <b>drowsy</b>, simulate slow blinks, long eye closures, yawns and head nods.
                </p>
                {([0, 1] as const).map((label) => (
                  <Button
                    key={label}
                    className={cn('w-full justify-start', recording === label && (label ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-cyan-500 hover:bg-cyan-600'))}
                    variant={recording === label ? 'default' : 'outline'}
                    disabled={!camera.video || engine.stage !== 'ready' || (recording !== null && recording !== label)}
                    onClick={() => setRecording(recording === label ? null : label)}
                  >
                    {recording === label ? <Square className="mr-2 h-4 w-4" /> : <CircleDot className="mr-2 h-4 w-4" />}
                    {recording === label ? 'Stop' : 'Record'} {label ? 'DROWSY' : 'ALERT'}
                  </Button>
                ))}
                <div className="grid grid-cols-2 gap-2 pt-2 text-center">
                  <div className="rounded-lg bg-cyan-400/10 py-2">
                    <div className="font-mono text-xl font-bold text-cyan-300">{counts.alert}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">alert</div>
                  </div>
                  <div className="rounded-lg bg-red-400/10 py-2">
                    <div className="font-mono text-xl font-bold text-red-300">{counts.drowsy}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">drowsy</div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Dataset"
            icon={Database}
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={() => setSamples((s) => [...s, ...generateSynthetic(150, Date.now() % 100000)])}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Add synthetic demo data
                </Button>
                <Button size="sm" variant="ghost" disabled={!samples.length} onClick={() => downloadFile(`drowsiness_dataset_${Date.now()}.csv`, samplesToCsv(samples))}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
                </Button>
                {user && (
                  <Button size="sm" variant="ghost" disabled={!samples.length} onClick={upload}>
                    <CloudUpload className="mr-1.5 h-3.5 w-3.5" /> Upload
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={!samples.length} onClick={() => setSamples([])}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            }
          >
            {samples.length ? (
              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="sticky top-0 bg-card text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5">label</th>
                      {Object.keys(samples[0].features).map((k) => (
                        <th key={k} className="px-2 py-1.5 font-normal">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {samples.slice(-50).reverse().map((s, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className={cn('px-2 py-1', s.label ? 'text-red-300' : 'text-cyan-300')}>{s.label ? 'drowsy' : 'alert'}</td>
                        {Object.values(s.features).map((v, j) => (
                          <td key={j} className="px-2 py-1 tabular">{(v as number).toFixed(3)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No samples yet. Record some, or add synthetic demo data to try the training workflow.
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Showing the latest 50 of {samples.length} rows. CSV columns match <code>ml/feature_spec.json</code>; drop the file into <code>ml/data/raw/</code> and run the Python pipeline.
            </p>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="2 · Train in browser" icon={FlaskConical}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Architecture</Label>
                <Select value={arch} onValueChange={(v) => setArch(v as Architecture)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mlp">MLP — 11 → 16 → 8 → 1 (ReLU, dropout)</SelectItem>
                    <SelectItem value="logistic_regression">Logistic regression (L2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <Label>Epochs</Label>
                  <span className="font-mono text-primary">{epochs}</span>
                </div>
                <Slider value={[epochs]} min={10} max={200} step={10} onValueChange={([v]) => setEpochs(v)} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <Label>Learning rate (Adam)</Label>
                  <span className="font-mono text-primary">{lr}</span>
                </div>
                <Slider value={[Math.log10(lr)]} min={-4} max={-1} step={0.5} onValueChange={([v]) => setLr(Number((10 ** v).toPrecision(2)))} />
              </div>
              <Button className="w-full" disabled={!canTrain} onClick={startTraining}>
                {training ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                {training ? `Training… epoch ${history.length}/${epochs}` : 'Train model'}
              </Button>
              {!canTrain && !training && (
                <p className="text-[11px] text-muted-foreground">Need ≥ 10 samples of each class.</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Split: chronological hold-out (last 20% of each class) to avoid leakage between overlapping windows.
              </p>
            </div>
          </Panel>

          {(history.length > 0 || trained) && (
            <Panel title="3 · Evaluate & deploy" icon={Rocket}>
              <div className="space-y-5">
                {history.length > 0 && <TrainingCurves history={history} />}
                {trained?.metrics && (
                  <>
                    <MetricsGrid metrics={trained.metrics} />
                    {trained.metrics.confusion_matrix && (
                      <div className="flex justify-center">
                        <ConfusionMatrix matrix={trained.metrics.confusion_matrix} />
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {trained.metrics.n_train} train / {trained.metrics.n_test} test windows.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={deploy}>
                        <Rocket className="mr-2 h-4 w-4" /> Deploy to monitor
                      </Button>
                      <Button variant="outline" onClick={() => downloadFile('drowsiness_model.json', JSON.stringify(trained, null, 2), 'application/json')}>
                        <Download className="mr-2 h-4 w-4" /> Export JSON
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Panel>
          )}

          <Panel title="Active model" icon={BrainCircuit}>
            {engine.model ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{engine.model.name}</span>
                  <span className="font-mono text-muted-foreground">v{engine.model.version}</span>
                </div>
                <p className="text-muted-foreground">{engine.model.source}</p>
                {engine.model.name.startsWith('browser-') && (
                  <Button size="sm" variant="outline" onClick={revert}>
                    <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Revert to bundled model
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Loading…</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

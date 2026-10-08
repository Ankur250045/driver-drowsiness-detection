import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BookOpen, BrainCircuit, Layers, ListTree, Scale, Server } from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Panel } from '@/components/layout/Panel';
import { ConfusionMatrix, MetricsGrid } from '@/components/ml/Evaluation';
import { loadActiveModel } from '@/services/classifier';
import { api } from '@/services/api';
import { useBackend } from '@/hooks/useBackend';
import { FEATURE_SPEC, type ModelArtifact } from '@/types';
import { cn } from '@/lib/utils';

export default function ModelPage() {
  const [model, setModel] = useState<ModelArtifact | null>(null);
  const [serverModel, setServerModel] = useState<Record<string, unknown> | null>(null);
  const { online } = useBackend();

  useEffect(() => {
    loadActiveModel().then(setModel).catch(console.error);
  }, []);
  useEffect(() => {
    if (online) api.modelInfo().then(setServerModel).catch(() => setServerModel(null));
  }, [online]);

  if (!model) return <p className="text-sm text-muted-foreground">Loading model…</p>;

  const layerSizes = [model.features.length, ...model.layers.map((l) => l.bias.length)];
  const isLinear = model.layers.length === 1;
  const weights = isLinear
    ? model.features
        .map((f, i) => ({ feature: f, weight: model.layers[0].weights[i][0] }))
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    : null;
  const params = model.layers.reduce((n, l) => n + l.weights.length * l.bias.length + l.bias.length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Model card"
        title={model.name}
        description="Documentation of the drowsiness classifier currently used by the live monitor, following the Model Cards for Model Reporting framework (Mitchell et al., 2019)."
        actions={
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              model.trained ? 'bg-emerald-400/15 text-emerald-300' : 'bg-yellow-400/15 text-yellow-300',
            )}
          >
            {model.trained ? 'Trained model' : 'Untrained baseline'} · v{model.version}
          </span>
        }
      />

      {!model.trained && (
        <div className="mb-6 flex gap-3 rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-300" />
          <p className="text-muted-foreground">
            This is the <b className="text-foreground">baseline</b> model with literature-informed prior weights — it has not been fitted to data,
            so no evaluation metrics are reported. Train one in the <b className="text-foreground">Data Lab</b> or run
            <code className="mx-1 rounded bg-background px-1.5 py-0.5 text-xs">python -m ml.training.train_classifier</code>
            to replace it with a trained model.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Architecture" icon={Layers} className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-center gap-3 py-4">
            {layerSizes.map((n, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background/60 px-4 py-3">
                    {Array.from({ length: Math.min(n, 8) }).map((_, k) => (
                      <span key={k} className={cn('h-2.5 w-2.5 rounded-full', i === 0 ? 'bg-cyan-400/80' : i === layerSizes.length - 1 ? 'bg-violet-400' : 'bg-sky-400/70')} />
                    ))}
                    {n > 8 && <span className="text-[10px] text-muted-foreground">⋮</span>}
                  </div>
                  <span className="font-mono text-xs">{n}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {i === 0 ? 'input' : i === layerSizes.length - 1 ? model.layers[i - 1].activation : model.layers[i - 1].activation}
                  </span>
                </div>
                {i < layerSizes.length - 1 && <span className="text-muted-foreground">→</span>}
              </div>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            {[
              ['Type', model.type === 'mlp' ? 'Multilayer perceptron' : 'Logistic regression'],
              ['Parameters', params.toLocaleString()],
              ['Input window', `${FEATURE_SPEC.window_seconds} s`],
              ['Trained at', model.trained_at ? new Date(model.trained_at).toLocaleString() : '—'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-background/50 p-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">{model.source}</p>
        </Panel>

        <Panel title="Intended use" icon={Scale}>
          <ul className="list-disc space-y-2 pl-4 text-xs text-muted-foreground">
            <li><b className="text-foreground">Use:</b> real-time estimation of driver drowsiness from a front-facing camera, as a driver-assistance aid.</li>
            <li><b className="text-foreground">Not for:</b> medical diagnosis, enforcement, or as the sole safety mechanism.</li>
            <li><b className="text-foreground">Limitations:</b> sensitive to lighting, sunglasses, extreme head angles and camera placement. Synthetic or single-person training data does not generalise.</li>
            <li><b className="text-foreground">Privacy:</b> inference runs locally; only aggregate metrics are optionally synced.</li>
          </ul>
        </Panel>

        {model.metrics && (
          <Panel title="Evaluation (held-out test set)" icon={BrainCircuit} className="lg:col-span-2">
            <div className="space-y-5">
              <MetricsGrid metrics={model.metrics} />
              {model.metrics.confusion_matrix && (
                <div className="flex justify-center">
                  <ConfusionMatrix matrix={model.metrics.confusion_matrix} />
                </div>
              )}
              {(model.metrics.n_train !== undefined || model.metrics.dataset !== undefined) && (
                <p className="text-xs text-muted-foreground">
                  {model.metrics.n_train !== undefined && `${model.metrics.n_train} training / ${model.metrics.n_test} test samples. `}
                  {typeof model.metrics.dataset === 'string' && `Dataset: ${model.metrics.dataset}`}
                </p>
              )}
            </div>
          </Panel>
        )}

        {weights && (
          <Panel title="Learned coefficients (standardised features)" icon={ListTree} className={model.metrics ? '' : 'lg:col-span-2'}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weights} layout="vertical" margin={{ left: 40, right: 12 }}>
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis type="category" dataKey="feature" stroke="hsl(var(--muted-foreground))" fontSize={10} width={110} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="weight" radius={3}>
                  {weights.map((w) => (
                    <Cell key={w.feature} fill={w.weight >= 0 ? '#f87171' : '#22d3ee'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-muted-foreground">Positive (red) pushes towards drowsy; negative (cyan) towards alert.</p>
          </Panel>
        )}

        <Panel title="Input features" icon={ListTree} className="lg:col-span-3" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Feature</th>
                  <th className="px-4 py-2 font-medium">Unit</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 text-right font-medium">Scaler μ</th>
                  <th className="px-4 py-2 text-right font-medium">Scaler σ</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_SPEC.features.map((f, i) => {
                  const idx = model.features.indexOf(f.name);
                  return (
                    <tr key={f.name} className="border-b border-border/50">
                      <td className="px-4 py-2 font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2 font-mono text-primary">{f.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{f.unit}</td>
                      <td className="px-4 py-2">{f.description}</td>
                      <td className="px-4 py-2 text-right font-mono tabular">{idx >= 0 ? model.scaler.mean[idx].toFixed(3) : '—'}</td>
                      <td className="px-4 py-2 text-right font-mono tabular">{idx >= 0 ? model.scaler.scale[idx].toFixed(3) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {serverModel && (
          <Panel title="Server-side model (FastAPI)" icon={Server} className="lg:col-span-3">
            <pre className="max-h-64 overflow-auto rounded-lg bg-background/60 p-3 text-[11px]">{JSON.stringify(serverModel, null, 2)}</pre>
          </Panel>
        )}

        <Panel title="References" icon={BookOpen} className="lg:col-span-3">
          <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
            <li>T. Soukupová and J. Čech, “Real-Time Eye Blink Detection using Facial Landmarks,” 21st Computer Vision Winter Workshop, 2016.</li>
            <li>W. W. Wierwille et al., “Research on vehicle-based driver status/performance monitoring,” NHTSA DOT HS 808 247, 1994 (PERCLOS).</li>
            <li>Y. Kartynnik et al., “Real-time Facial Surface Geometry from Monocular Video on Mobile GPUs,” CVPR Workshops, 2019 (MediaPipe Face Mesh).</li>
            <li>M. Mitchell et al., “Model Cards for Model Reporting,” FAT* 2019.</li>
            <li>MRL Eye Dataset, Media Research Lab, VŠB – Technical University of Ostrava (eye-state CNN in ml/).</li>
          </ol>
        </Panel>
      </div>
    </>
  );
}

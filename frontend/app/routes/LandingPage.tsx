import { Link } from 'wouter';
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Camera,
  Cpu,
  Database,
  Eye,
  FlaskConical,
  Lock,
  Server,
  Sigma,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const PIPELINE = [
  { icon: Camera, title: 'Capture', body: 'Webcam frames at ~30 FPS via getUserMedia.' },
  { icon: Eye, title: 'Landmarks', body: 'MediaPipe Face Mesh (TF.js, WebGL) → 478 3D points incl. irises.' },
  { icon: Sigma, title: 'Features', body: 'EAR, MAR, head pose per frame → 11 temporal features over a 10 s window (PERCLOS, blink rate, microsleeps…).' },
  { icon: BrainCircuit, title: 'Classifier', body: 'Logistic regression / MLP trained with scikit-learn or TF.js → P(drowsy), EMA smoothed.' },
  { icon: Zap, title: 'Decision', body: 'Hybrid rule + model state machine raises audio-visual alarms and logs events.' },
];

const FEATURES = [
  { icon: Cpu, title: 'On-device inference', body: 'The entire vision + ML pipeline runs in the browser with WebGL acceleration. No frames are uploaded.' },
  { icon: FlaskConical, title: 'Train your own model', body: 'Record labelled data in the Data Lab and train a neural network in the browser — loss curves, confusion matrix and ROC-AUC included.' },
  { icon: BarChart3, title: 'Explainable AI', body: 'Occlusion-based feature attributions show exactly why the model thinks you are drowsy.' },
  { icon: Database, title: 'Reproducible ML pipeline', body: 'Python pipeline (pandas, scikit-learn, TensorFlow) with preprocessing, model comparison, cross-validation and an eye-state CNN.' },
  { icon: Server, title: 'FastAPI backend', body: 'JWT auth, prediction API, session analytics and dataset collection backed by SQLite/SQLAlchemy.' },
  { icon: Lock, title: 'Privacy by design', body: 'Only aggregate session metrics are synced — and only if you sign in.' },
];

const STACK = ['TensorFlow.js', 'MediaPipe Face Mesh', 'React 18', 'TypeScript', 'Tailwind CSS', 'Recharts', 'FastAPI', 'SQLAlchemy', 'scikit-learn', 'TensorFlow / Keras', 'pandas', 'Docker'];

export default function LandingPage() {
  return (
    <div className="space-y-16 pb-10">
      {/* hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-14 md:px-12 md:py-20">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Computer Vision · Machine Learning · Road Safety
          </div>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight md:text-6xl">
            Detect driver fatigue <span className="text-gradient">before it becomes an accident.</span>
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            DrowsiGuard AI is a real-time drowsiness detection system that combines facial-landmark
            geometry, temporal feature engineering and a trainable machine-learning classifier to
            recognise microsleeps, yawning and head nodding — directly in your browser.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="glow-cyan">
              <Link href="/monitor">
                Launch live monitor <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/model">How the model works</Link>
            </Button>
          </div>
          <dl className="grid max-w-xl grid-cols-3 gap-4 pt-4">
            {[
              ['478', '3D facial landmarks'],
              ['11', 'engineered features'],
              ['~30 FPS', 'on-device inference'],
            ].map(([v, k]) => (
              <div key={k}>
                <dt className="font-mono text-2xl font-bold text-foreground">{v}</dt>
                <dd className="text-xs text-muted-foreground">{k}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* pipeline */}
      <section className="space-y-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">System architecture</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Inference pipeline</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          {PIPELINE.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="relative rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
              {i < PIPELINE.length - 1 && (
                <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-background p-0.5 text-primary md:block" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* formulas */}
      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            name: 'Eye Aspect Ratio',
            formula: 'EAR = (‖p₂−p₆‖ + ‖p₃−p₅‖) / 2‖p₁−p₄‖',
            note: 'Drops towards 0 when the eye closes (Soukupová & Čech, 2016).',
          },
          {
            name: 'PERCLOS',
            formula: 'PERCLOS = frames(EAR < τ) / frames(window)',
            note: 'Percentage of eyelid closure — the most validated fatigue measure (Wierwille et al.).',
          },
          {
            name: 'Classifier',
            formula: 'P(drowsy) = σ(wᵀ·standardise(x) + b)',
            note: 'Logistic regression or MLP over 11 window features; smoothed with an EMA.',
          },
        ].map((f) => (
          <div key={f.name} className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{f.name}</div>
            <div className="my-3 rounded-lg bg-background/70 px-3 py-3 font-mono text-sm text-cyan-300">{f.formula}</div>
            <p className="text-xs text-muted-foreground">{f.note}</p>
          </div>
        ))}
      </section>

      {/* features */}
      <section className="space-y-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Capabilities</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">What's inside</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* stack */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tech stack</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {STACK.map((s) => (
            <span key={s} className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs">
              {s}
            </span>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        ⚠️ Research / educational prototype. Not a certified safety device — if you feel tired, stop and rest.
      </p>
    </div>
  );
}

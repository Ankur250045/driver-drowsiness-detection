import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { Loader2, ServerOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/services/api';
import { useBackend } from '@/hooks/useBackend';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { online, refreshUser } = useBackend();
  const [, navigate] = useLocation();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') await api.register(email, password, name);
      await api.login(email, password);
      await refreshUser();
      navigate('/analytics');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-6 space-y-2 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500">
            <ShieldCheck className="h-6 w-6 text-slate-950" />
          </div>
          <h1 className="text-xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create an account'}</h1>
          <p className="text-xs text-muted-foreground">Sync session reports and contribute training data to the backend.</p>
        </div>

        {!online ? (
          <div className="flex gap-3 rounded-lg border border-border bg-background/50 p-4 text-xs text-muted-foreground">
            <ServerOff className="h-5 w-5 shrink-0" />
            <p>
              The FastAPI backend is offline. Start it with
              <code className="mx-1 rounded bg-background px-1 py-0.5">uvicorn app.main:app --reload</code>
              inside <code>backend/</code>. The rest of the app works without it.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? "Don't have an account? Register" : 'Already registered? Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

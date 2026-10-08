import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  Database,
  Github,
  Home,
  LogIn,
  LogOut,
  Menu,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useBackend } from '@/hooks/useBackend';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Overview', icon: Home },
  { href: '/monitor', label: 'Live Monitor', icon: Activity },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/data-lab', label: 'Data Lab', icon: Database },
  { href: '/model', label: 'Model Card', icon: BrainCircuit },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { online, health, user, logout } = useBackend();

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? location === '/' : location.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/20">
        <ShieldCheck className="h-5 w-5 text-slate-950" />
      </div>
      <div className="leading-tight">
        <div className="font-bold tracking-tight">DrowsiGuard</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary">AI · Vision</div>
      </div>
    </Link>
  );

  const backendBadge = (
    <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3 text-xs">
      <div className="flex items-center gap-2">
        <Server className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">API</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', online ? 'bg-emerald-400' : 'bg-slate-500')} />
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      {online && health && (
        <div className="truncate text-muted-foreground">
          Server model: <span className="text-foreground">{health.model.name}</span>
        </div>
      )}
      {!online && <div className="text-muted-foreground">Running local-first in the browser.</div>}
    </div>
  );

  const account = online ? (
    user ? (
      <div className="flex items-center gap-2 text-xs">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
          {(user.full_name ?? user.email)[0].toUpperCase()}
        </div>
        <span className="truncate">{user.full_name ?? user.email}</span>
        <button onClick={logout} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Log out">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    ) : (
      <Link
        href="/login"
        className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-accent"
      >
        <LogIn className="h-3.5 w-3.5" /> Sign in to sync sessions
      </Link>
    )
  ) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        {brand}
        {nav}
        <div className="mt-auto space-y-3">
          {account}
          {backendBadge}
          <a
            href="https://github.com/ankur250045/driver-drowsiness-detection"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" /> Source on GitHub
          </a>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
        {brand}
        <button onClick={() => setOpen(!open)} aria-label="Toggle navigation" className="rounded-md p-2 hover:bg-accent">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-[61px] z-20 space-y-4 border-b border-border bg-sidebar p-4 lg:hidden">
          {nav}
          {account}
          {backendBadge}
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        {eyebrow && (
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</div>
        )}
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

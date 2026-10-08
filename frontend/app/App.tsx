import { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';
import { Loader2 } from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/layout/AppShell';
import { BackendProvider } from '@/hooks/useBackend';
import LandingPage from './routes/LandingPage';
import NotFound from './routes/not-found';

// Heavy routes (TF.js, charts) are code-split.
const MonitorPage = lazy(() => import('./routes/MonitorPage'));
const AnalyticsPage = lazy(() => import('./routes/AnalyticsPage'));
const DataLabPage = lazy(() => import('./routes/DataLabPage'));
const ModelPage = lazy(() => import('./routes/ModelPage'));
const LoginPage = lazy(() => import('./routes/LoginPage'));

function Fallback() {
  return (
    <div className="flex items-center gap-2 py-20 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

export default function App() {
  return (
    <BackendProvider>
      <TooltipProvider>
        <AppShell>
          <Suspense fallback={<Fallback />}>
            <Switch>
              <Route path="/" component={LandingPage} />
              <Route path="/monitor" component={MonitorPage} />
              <Route path="/analytics" component={AnalyticsPage} />
              <Route path="/data-lab" component={DataLabPage} />
              <Route path="/model" component={ModelPage} />
              <Route path="/login" component={LoginPage} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </AppShell>
        <Toaster />
      </TooltipProvider>
    </BackendProvider>
  );
}

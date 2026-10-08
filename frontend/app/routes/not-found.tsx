import { Link } from 'wouter';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <Compass className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-bold">404 — Page not found</h1>
      <Button asChild>
        <Link href="/">Back to overview</Link>
      </Button>
    </div>
  );
}

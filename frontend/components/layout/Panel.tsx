import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Panel({
  title,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)}>
      {title && (
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          {Icon && <Icon className="h-4 w-4 text-primary" />}
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

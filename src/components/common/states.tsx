import { CircleAlert, Database, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { messageFor } from '@/lib/errors';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon className="size-7" strokeWidth={1.6} aria-hidden="true" />
      </span>
      <h2 className="font-display text-2xl font-medium">{title}</h2>
      {description ? <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  error,
  title = 'Something went wrong',
  onRetry,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-12 text-center', className)}
    >
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-status-cancelled-soft text-status-cancelled">
        <CircleAlert className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{messageFor(error)}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Shown instead of pretending to work when Supabase environment variables are missing. */
export function SetupRequired({ className }: { className?: string }) {
  return (
    <div
      role="alert"
      className={cn('rounded-2xl border border-honey-soft bg-honey-soft/40 px-6 py-8 text-center sm:px-10', className)}
    >
      <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-card text-honey shadow-soft">
        <Database className="size-6" aria-hidden="true" />
      </span>
      <h2 className="font-display text-2xl font-medium">Ordering isn’t connected yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        This site has not been connected to its database. If you run this canteen, set{' '}
        <code className="rounded bg-card px-1.5 py-0.5 text-xs">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-card px-1.5 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code> and redeploy — see
        docs/SETUP.md.
      </p>
    </div>
  );
}

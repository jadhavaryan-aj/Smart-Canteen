import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: ReactNode;
  tone?: 'default' | 'new' | 'preparing' | 'ready' | 'money';
}) {
  const toneClass = {
    default: 'bg-muted text-foreground',
    new: 'bg-status-new-soft text-status-new',
    preparing: 'bg-status-preparing-soft text-status-preparing',
    ready: 'bg-status-ready-soft text-status-ready',
    money: 'bg-secondary text-primary',
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <span className={cn('flex size-10 items-center justify-center rounded-xl', toneClass)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <p className="tabular mt-3 font-display text-4xl font-medium">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

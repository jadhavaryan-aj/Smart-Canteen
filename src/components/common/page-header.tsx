import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div>
        {eyebrow ? (
          <p className="mb-2 text-xs font-bold tracking-[0.16em] text-sage uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-4xl leading-[1.05] font-medium sm:text-5xl">{title}</h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-[0.95rem] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

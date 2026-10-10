import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-[inset_0_1px_1px_rgb(31_30_27/0.03)] transition-[border-color,box-shadow] placeholder:text-muted-foreground/80',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/15',
        'file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}

export { Input };

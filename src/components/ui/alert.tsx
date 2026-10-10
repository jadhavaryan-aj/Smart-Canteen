import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-2xl border px-4 py-3.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-[1.1rem] [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-foreground [&>svg]:text-primary',
        info: 'border-sage-soft bg-secondary text-secondary-foreground [&>svg]:text-primary',
        warning: 'border-honey-soft bg-honey-soft/60 text-[#6b4710] [&>svg]:text-honey',
        destructive:
          'border-status-cancelled-soft bg-status-cancelled-soft/60 text-status-cancelled [&>svg]:text-status-cancelled',
        success: 'border-status-ready-soft bg-status-ready-soft/60 text-status-ready [&>svg]:text-status-ready',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('col-start-2 font-semibold', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 text-sm leading-relaxed opacity-90 [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };

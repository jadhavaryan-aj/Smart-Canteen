import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';

export function Price({ paise, className }: { paise: number; className?: string }) {
  return <span className={cn('tabular font-semibold', className)}>{formatPaise(paise)}</span>;
}

import { Minus, Plus, Trash2 } from 'lucide-react';

import { MAX_QUANTITY_PER_LINE } from '@/lib/cart/cart';
import { cn } from '@/lib/utils';

interface QuantityStepperProps {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  label: string;
  max?: number;
  size?: 'sm' | 'default';
  /** Show a bin icon instead of "−" when the next decrement removes the line. */
  showRemoveAtOne?: boolean;
  className?: string;
}

export function QuantityStepper({
  value,
  onIncrement,
  onDecrement,
  label,
  max = MAX_QUANTITY_PER_LINE,
  size = 'default',
  showRemoveAtOne = false,
  className,
}: QuantityStepperProps) {
  const buttonSize = size === 'sm' ? 'size-9' : 'size-11';
  const removing = showRemoveAtOne && value <= 1;
  return (
    <div
      role="group"
      aria-label={`Quantity for ${label}`}
      className={cn('inline-flex items-center rounded-full border border-input bg-card shadow-xs', className)}
    >
      <button
        type="button"
        onClick={onDecrement}
        aria-label={removing ? `Remove ${label}` : `Decrease quantity of ${label}`}
        className={cn(
          buttonSize,
          'inline-flex items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none active:scale-95',
        )}
      >
        {removing ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
      </button>
      <span aria-live="polite" className="tabular min-w-7 text-center text-sm font-bold">
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={value >= max}
        aria-label={`Increase quantity of ${label}`}
        className={cn(
          buttonSize,
          'inline-flex items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none active:scale-95 disabled:opacity-40',
        )}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

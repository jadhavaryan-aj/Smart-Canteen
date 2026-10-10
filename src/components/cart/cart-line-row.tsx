import { CircleAlert, X } from 'lucide-react';
import { motion } from 'motion/react';

import { FoodImage } from '@/components/common/food-image';
import { Price } from '@/components/common/price';
import { VegIndicator } from '@/components/common/veg-indicator';
import { lineTotalPaise, unitPricePaise, type CartLine } from '@/lib/cart/cart';
import { cartStore } from '@/lib/cart/cart-store';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';

import { QuantityStepper } from './quantity-stepper';

export function CartLineRow({ line, unavailable = false }: { line: CartLine; unavailable?: boolean }) {
  const { dispatch } = cartStore;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      className={cn('flex gap-3.5 py-4', unavailable && 'opacity-80')}
    >
      <FoodImage
        src={line.imageUrl}
        alt={line.name}
        className="size-[4.5rem] shrink-0 rounded-xl"
        sizes="72px"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold leading-snug">
              <VegIndicator vegetarian={line.isVegetarian} className="size-3.5" />
              <span className="truncate">{line.name}</span>
            </p>
            {line.options.length > 0 ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {line.options
                  .map((option) => (option.priceDeltaPaise ? `${option.name} (+${formatPaise(option.priceDeltaPaise)})` : option.name))
                  .join(' · ')}
              </p>
            ) : null}
            {line.note ? <p className="mt-0.5 text-xs text-muted-foreground italic">“{line.note}”</p> : null}
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'remove', lineId: line.lineId })}
            aria-label={`Remove ${line.name} from cart`}
            className="-mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        {unavailable ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-status-cancelled-soft px-2.5 py-1 text-xs font-semibold text-status-cancelled">
            <CircleAlert className="size-3.5" aria-hidden="true" /> No longer available — please remove
          </p>
        ) : (
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <QuantityStepper
              size="sm"
              value={line.quantity}
              label={line.name}
              showRemoveAtOne
              onIncrement={() => dispatch({ type: 'increment', lineId: line.lineId })}
              onDecrement={() => dispatch({ type: 'decrement', lineId: line.lineId })}
            />
            <div className="text-right">
              <Price paise={lineTotalPaise(line)} className="block" />
              {line.quantity > 1 ? (
                <span className="tabular text-xs text-muted-foreground">{formatPaise(unitPricePaise(line))} each</span>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </motion.li>
  );
}

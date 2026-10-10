import { ShoppingBag } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { useCart } from '@/lib/cart/cart-store';
import { cn } from '@/lib/utils';

import { useCartDrawer } from './cart-drawer-context';

export function CartButton({ className }: { className?: string }) {
  const { totals } = useCart();
  const { openCart } = useCartDrawer();
  const count = totals.itemCount;

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={count > 0 ? `Open cart, ${count} item${count === 1 ? '' : 's'}` : 'Open cart (empty)'}
      className={cn(
        'relative inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-sage hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
        className,
      )}
    >
      <ShoppingBag className="size-[1.15rem]" aria-hidden="true" />
      <AnimatePresence>
        {count > 0 ? (
          <motion.span
            key={count}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            className="tabular absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.68rem] font-bold text-primary-foreground ring-2 ring-background"
          >
            {count}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </button>
  );
}

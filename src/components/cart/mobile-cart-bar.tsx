import { ShoppingBag } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { formatPaise } from '@/lib/money';
import { useCart } from '@/lib/cart/cart-store';

import { useCartDrawer } from './cart-drawer-context';

/** Thumb-friendly cart summary pinned to the bottom of small screens. */
export function MobileCartBar() {
  const { totals } = useCart();
  const { openCart, open } = useCartDrawer();
  const visible = totals.itemCount > 0 && !open;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="no-print fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <button
            type="button"
            onClick={openCart}
            className="flex h-14 w-full items-center gap-3 rounded-2xl bg-primary px-4 text-primary-foreground shadow-lift active:scale-[0.99]"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary-foreground/15">
              <ShoppingBag className="size-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold">
              {totals.itemCount} item{totals.itemCount === 1 ? '' : 's'}
            </span>
            <span className="ml-auto flex items-center gap-2 text-sm font-bold">
              <span className="tabular">{formatPaise(totals.subtotalPaise)}</span>
              <span className="rounded-full bg-primary-foreground/15 px-3 py-1">View tray</span>
            </span>
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

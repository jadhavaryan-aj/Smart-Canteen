import { ArrowRight, ShoppingBag } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/common/states';
import { Price } from '@/components/common/price';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCartSync } from '@/hooks/use-cart-sync';
import { useCart } from '@/lib/cart/cart-store';

import { CartLineRow } from './cart-line-row';
import { useCartDrawer } from './cart-drawer-context';

export function CartDrawer() {
  const { open, setOpen } = useCartDrawer();
  const { lines, totals } = useCart();
  const { unavailableLineIds } = useCartSync();
  const hasUnavailable = lines.some((line) => unavailableLineIds.has(line.lineId));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="no-print">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Your order</SheetTitle>
          <SheetDescription>
            {totals.itemCount > 0
              ? `${totals.itemCount} item${totals.itemCount === 1 ? '' : 's'} in your tray`
              : 'Nothing here yet'}
          </SheetDescription>
        </SheetHeader>

        {lines.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="Your tray is empty"
            description="Browse today’s menu and add something you fancy."
            action={
              <Button asChild onClick={() => setOpen(false)}>
                <Link to="/menu">Browse the menu</Link>
              </Button>
            }
            className="my-auto"
          />
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-5" aria-label="Cart items">
              <AnimatePresence initial={false}>
                {lines.map((line) => (
                  <CartLineRow key={line.lineId} line={line} unavailable={unavailableLineIds.has(line.lineId)} />
                ))}
              </AnimatePresence>
            </ul>
            <SheetFooter className="border-t border-border bg-card/70">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Subtotal</span>
                <Price paise={totals.subtotalPaise} className="font-display text-2xl font-medium" />
              </div>
              <p className="text-xs text-muted-foreground">
                Prices include taxes. The final amount is confirmed by our server before you pay.
              </p>
              <Button asChild size="lg" className="w-full" disabled={hasUnavailable}>
                <Link to="/checkout" onClick={() => setOpen(false)} aria-disabled={hasUnavailable}>
                  Review & checkout <ArrowRight />
                </Link>
              </Button>
              {hasUnavailable ? (
                <p className="text-center text-xs font-semibold text-status-cancelled">
                  Remove unavailable items to continue.
                </p>
              ) : null}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

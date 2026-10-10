import { motion } from 'motion/react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';

import { CartDrawer } from '@/components/cart/cart-drawer';
import { CartDrawerProvider } from '@/components/cart/cart-drawer-context';
import { MobileCartBar } from '@/components/cart/mobile-cart-bar';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-[60] rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to content
    </a>
  );
}

export default function StudentLayout() {
  const { pathname } = useLocation();
  const showCartBar = !pathname.startsWith('/checkout') && !pathname.startsWith('/orders/');

  return (
    <CartDrawerProvider>
      <SkipLink />
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
        <SiteFooter />
      </div>
      <CartDrawer />
      {showCartBar ? <MobileCartBar /> : null}
      <ScrollRestoration />
    </CartDrawerProvider>
  );
}

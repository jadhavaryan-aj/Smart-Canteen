import { Menu as MenuIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router';

import { CartButton } from '@/components/cart/cart-button';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useSettings } from '@/hooks/use-settings';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

import { BrandMark } from './brand-mark';
import { Container } from './container';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/menu', label: 'Menu', end: false },
  { to: '/orders', label: 'My Orders', end: false },
  { to: '/about', label: 'About', end: false },
] as const;

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="md:hidden" aria-label="Open navigation menu">
          <MenuIcon className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-xs">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-3">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'rounded-xl px-4 py-3.5 text-lg font-semibold transition-colors',
                  isActive ? 'bg-secondary text-primary' : 'text-foreground hover:bg-muted',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto p-5">
          <Button asChild size="lg" className="w-full">
            <Link to="/menu" onClick={() => setOpen(false)}>
              Order now
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const settings = useSettings();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled}
      className="no-print sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur-md transition-colors duration-300 data-[scrolled=true]:border-border"
    >
      <Container className="flex h-16 items-center gap-4 sm:h-[4.5rem]">
        <BrandMark name={settings.data?.canteenName ?? brand.name} />
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'relative rounded-full px-3.5 py-2 text-sm font-semibold transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {link.label}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-x-3.5 -bottom-0.5 h-[2px] rounded-full bg-primary transition-transform duration-300',
                      isActive ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CartButton />
          <Button asChild size="sm" className="hidden h-11 px-5 sm:inline-flex">
            <Link to="/menu">Order now</Link>
          </Button>
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}

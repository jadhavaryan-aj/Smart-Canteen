import {
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu as MenuIcon,
  MonitorPlay,
  Settings,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';

import { BrandMonogram } from '@/components/layout/brand-mark';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { signOutStaff } from '@/services/admin/auth';

import { useAdminRealtime } from './admin-realtime';
import { AlertToggles } from './alert-toggles';
import { ConnectionIndicator } from './connection-indicator';
import { OrderingControl } from './ordering-control';
import { useStaff } from './staff-context';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/queue', label: 'Live queue', icon: MonitorPlay },
  { to: '/admin/orders', label: 'Orders', icon: ListOrdered },
  { to: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/admin/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin } = useStaff();
  const { newOrderIds } = useAdminRealtime();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {NAV.filter((item) => isAdmin || !item.adminOnly).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
              isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
            )
          }
        >
          <item.icon className="size-[1.1rem]" aria-hidden="true" />
          {item.label}
          {item.to === '/admin/queue' && newOrderIds.size > 0 ? (
            <span className="tabular ml-auto rounded-full bg-honey px-2 py-0.5 text-xs font-bold text-white">
              {newOrderIds.size} new
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

function UserCard() {
  const staff = useStaff();
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="truncate text-sm font-semibold">{staff.displayName ?? staff.email}</p>
      <p className="truncate text-xs text-muted-foreground">
        {staff.isAdmin ? 'Administrator' : 'Staff'} · {staff.email}
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full justify-start"
        onClick={async () => {
          await signOutStaff();
          navigate('/admin/login', { replace: true });
        }}
      >
        <LogOut /> Sign out
      </Button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <BrandMonogram />
      <div>
        <p className="font-display text-lg leading-none font-medium">Campus Table</p>
        <p className="mt-1 text-[0.68rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">Kitchen & admin</p>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-[#f5f2ea] xl:grid xl:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-card p-4 xl:flex">
        <Brand />
        <NavLinks />
        <div className="mt-auto">
          <UserCard />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-[#f5f2ea]/90 px-3 backdrop-blur-md sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="xl:hidden" aria-label="Open admin navigation">
                <MenuIcon className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="gap-6 p-4">
              <SheetHeader className="p-0">
                <SheetTitle className="sr-only">Admin navigation</SheetTitle>
                <SheetDescription className="sr-only">Go to a section of the admin panel</SheetDescription>
                <Brand />
              </SheetHeader>
              <NavLinks onNavigate={() => setMobileOpen(false)} />
              <div className="mt-auto">
                <UserCard />
              </div>
            </SheetContent>
          </Sheet>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <ConnectionIndicator />
            <OrderingControl />
            <AlertToggles />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 p-3 outline-none sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

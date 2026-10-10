import { LoaderCircle, LogOut, ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { AdminRealtimeProvider } from '@/components/admin/admin-realtime';
import { AdminShell } from '@/components/admin/admin-shell';
import { StaffContext } from '@/components/admin/staff-context';
import { ErrorState, SetupRequired } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { useStaffSession } from '@/hooks/admin/use-staff-session';
import { supabaseConfig } from '@/lib/supabase/env';
import { signOutStaff } from '@/services/admin/auth';

import { SkipLink } from './StudentLayout';

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

/**
 * Guards the admin panel. This check is a convenience for people: the real
 * protection is server-side (RLS policies and role checks in SQL), so even a
 * tampered client cannot read or change protected data.
 */
export default function AdminLayout() {
  useNoIndex();
  const location = useLocation();
  const session = useStaffSession();

  if (!supabaseConfig.isConfigured) {
    return (
      <div className="mx-auto max-w-xl p-6 py-20">
        <SetupRequired />
      </div>
    );
  }

  if (session.isPending) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Checking your access…
      </div>
    );
  }

  if (session.isError) {
    return (
      <div className="mx-auto max-w-xl p-6 py-20">
        <ErrorState
          error={session.error}
          title="We couldn’t verify your access"
          onRetry={() => void session.refetch()}
        />
      </div>
    );
  }

  if (!session.data) {
    return (
      <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
    );
  }

  if (!session.data.role) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-status-cancelled-soft text-status-cancelled">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-medium">This account isn’t authorised</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are signed in as {session.data.email}, but this account has not been given a staff or
            administrator role. Ask an administrator to grant access.
          </p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={async () => {
              await signOutStaff();
              await session.refetch();
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <StaffContext.Provider value={session.data}>
      <AdminRealtimeProvider>
        <SkipLink />
        <AdminShell>
          <Outlet />
        </AdminShell>
      </AdminRealtimeProvider>
    </StaffContext.Provider>
  );
}

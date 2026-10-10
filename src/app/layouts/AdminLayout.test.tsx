import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StaffSession } from '@/services/admin/auth';

const sessionState: { data: StaffSession | null | undefined; isPending: boolean; isError: boolean } = {
  data: undefined,
  isPending: true,
  isError: false,
};

vi.mock('@/lib/supabase/env', () => ({
  supabaseConfig: { url: 'https://x.supabase.co', anonKey: 'k'.repeat(40), isConfigured: true },
}));
vi.mock('@/hooks/admin/use-staff-session', () => ({
  staffSessionKey: ['staff-session'],
  useStaffSession: () => ({ ...sessionState, refetch: vi.fn(), error: null }),
}));
// The realtime provider and shell are exercised in the Playwright admin flow.
vi.mock('@/components/admin/admin-realtime', () => ({
  AdminRealtimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/admin/admin-shell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-shell">{children}</div>
  ),
}));

const { default: AdminLayout } = await import('./AdminLayout');

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/admin/login', element: <p>login page</p> },
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [{ path: 'orders', element: <p>secret orders</p> }],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const fakeSession = (role: StaffSession['role']): StaffSession => ({
  session: {} as StaffSession['session'],
  email: 'person@example.test',
  displayName: null,
  role,
});

describe('admin route guard', () => {
  beforeEach(() => {
    sessionState.data = undefined;
    sessionState.isPending = false;
    sessionState.isError = false;
  });

  it('redirects signed-out visitors to the login page, remembering where they were going', async () => {
    sessionState.data = null;
    const router = renderAt('/admin/orders');
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Fadmin%2Forders');
    expect(screen.queryByText('secret orders')).not.toBeInTheDocument();
  });

  it('blocks signed-in users without a staff role', async () => {
    sessionState.data = fakeSession(null);
    renderAt('/admin/orders');
    expect(await screen.findByText(/isn’t authorised/)).toBeInTheDocument();
    expect(screen.queryByText('secret orders')).not.toBeInTheDocument();
  });

  it('shows the panel to staff', async () => {
    sessionState.data = fakeSession('staff');
    renderAt('/admin/orders');
    expect(await screen.findByText('secret orders')).toBeInTheDocument();
  });

  it('shows nothing protected while access is being checked', () => {
    sessionState.isPending = true;
    renderAt('/admin/orders');
    expect(screen.getByRole('status')).toHaveTextContent(/Checking your access/);
    expect(screen.queryByText('secret orders')).not.toBeInTheDocument();
  });
});

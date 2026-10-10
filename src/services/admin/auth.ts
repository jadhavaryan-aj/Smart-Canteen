import type { Session } from '@supabase/supabase-js';

import { AppError, fromPostgrestError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/client';
import type { AppRole } from '@/types/domain';

export interface StaffSession {
  session: Session;
  email: string;
  displayName: string | null;
  role: AppRole | null;
}

/**
 * Reads the current admin-panel session and the caller's role. The role is
 * read from the database (public.user_roles via get_my_staff_role), never from
 * client-editable metadata. Hiding UI is a convenience; every protected
 * operation is enforced again by RLS and SQL role checks.
 */
export async function fetchStaffSession(): Promise<StaffSession | null> {
  const client = getAdminSupabase();
  const { data } = await client.auth.getSession();
  if (!data.session) return null;

  const [{ data: role, error }, profile] = await Promise.all([
    client.rpc('get_my_staff_role'),
    client.from('profiles').select('display_name').eq('id', data.session.user.id).maybeSingle(),
  ]);
  if (error) throw fromPostgrestError(error);

  return {
    session: data.session,
    email: data.session.user.email ?? '',
    displayName: profile.data?.display_name ?? null,
    role: role ?? null,
  };
}

export async function signInStaff(email: string, password: string): Promise<void> {
  const { error } = await getAdminSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    const invalid = /invalid login credentials/i.test(error.message) || error.status === 400;
    throw new AppError(
      invalid ? 'INVALID_CREDENTIALS' : 'NETWORK_ERROR',
      invalid ? 'Incorrect email or password.' : 'We could not sign you in. Please try again.',
      { cause: error },
    );
  }
}

export async function signOutStaff(): Promise<void> {
  await getAdminSupabase().auth.signOut();
}

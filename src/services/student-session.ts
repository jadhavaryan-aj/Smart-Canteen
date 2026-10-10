import { AppError, FRIENDLY_MESSAGES } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase/client';

/**
 * Students order as anonymous Supabase users: no email, phone or password is
 * collected, yet every order is owned by a real auth user so Row Level
 * Security can restrict each student to their own orders.
 */
export async function ensureStudentSession(): Promise<string> {
  const auth = getSupabase().auth;
  const { data } = await auth.getSession();
  if (data.session?.user) return data.session.user.id;

  const { data: signedIn, error } = await auth.signInAnonymously();
  if (error || !signedIn.user) {
    const disabled = /anonymous/i.test(error?.message ?? '') || error?.status === 422;
    throw new AppError(
      disabled ? 'GUEST_AUTH_DISABLED' : 'NETWORK_ERROR',
      disabled ? FRIENDLY_MESSAGES.GUEST_AUTH_DISABLED! : FRIENDLY_MESSAGES.NETWORK_ERROR!,
      { cause: error },
    );
  }
  return signedIn.user.id;
}

/** Returns the current student id without creating a session. */
export async function currentStudentId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

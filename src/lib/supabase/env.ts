/**
 * Public (browser) configuration. The Supabase URL and anon/publishable key
 * are designed to be public; every protected operation is enforced by Row
 * Level Security and server-side functions. Never put the service-role key or
 * any Razorpay secret in a VITE_ variable.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const supabaseConfig = {
  url,
  anonKey,
  isConfigured: /^https?:\/\/.+/.test(url) && anonKey.length > 20,
} as const;

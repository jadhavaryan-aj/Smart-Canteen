import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { AppError, FRIENDLY_MESSAGES } from '@/lib/errors';

import type { Database } from './database.types';
import { supabaseConfig } from './env';

export type TypedSupabaseClient = SupabaseClient<Database>;

let studentClient: TypedSupabaseClient | null = null;
let adminClient: TypedSupabaseClient | null = null;

function assertConfigured(): void {
  if (!supabaseConfig.isConfigured) {
    throw new AppError('SUPABASE_NOT_CONFIGURED', FRIENDLY_MESSAGES.SUPABASE_NOT_CONFIGURED!);
  }
}

/**
 * Client for the student-facing site. Students are anonymous Supabase users;
 * their session is stored separately from any admin session on the same
 * device so signing in at the counter never disturbs a student's orders.
 */
export function getSupabase(): TypedSupabaseClient {
  assertConfigured();
  studentClient ??= createClient<Database>(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: { storageKey: 'campus-table-student-auth', persistSession: true, autoRefreshToken: true },
  });
  return studentClient;
}

/** Client for the admin panel (email/password staff accounts). */
export function getAdminSupabase(): TypedSupabaseClient {
  assertConfigured();
  adminClient ??= createClient<Database>(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      storageKey: 'campus-table-admin-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return adminClient;
}

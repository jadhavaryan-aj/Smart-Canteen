/**
 * Deno-only Supabase wiring. The service-role key is read from the Edge
 * Function environment (provided automatically by Supabase) and never leaves
 * the server.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getBearerToken, type Authenticator } from '../auth.ts';
import { toRpcError, type RpcClient } from '../rpc.ts';
import { requireEnv } from './env.ts';

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  serviceClient ??= createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    clientOptions,
  );
  return serviceClient;
}

export class SupabaseRpcClient implements RpcClient {
  constructor(private readonly client: SupabaseClient) {}

  async call<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw toRpcError(error);
    return data as T;
  }
}

export function createServiceRpcClient(): RpcClient {
  return new SupabaseRpcClient(getServiceClient());
}

/** Validates the caller's JWT with Supabase Auth (works with any signing key type). */
export function createAuthenticator(): Authenticator {
  return async (request) => {
    const token = getBearerToken(request);
    if (!token) return null;
    const { data, error } = await getServiceClient().auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, isAnonymous: Boolean(data.user.is_anonymous) };
  };
}

/** An RPC client that acts as the caller, so RLS and role checks apply to them. */
export function createUserRpcClient(request: Request): RpcClient {
  const token = getBearerToken(request);
  const client = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${token ?? ''}` } },
  });
  return new SupabaseRpcClient(client);
}

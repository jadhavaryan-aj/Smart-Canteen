import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import { AppError, FRIENDLY_MESSAGES } from '@/lib/errors';

import type { TypedSupabaseClient } from './client';

interface FunctionErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

/**
 * Invokes an Edge Function and converts failures into AppErrors carrying the
 * server's machine-readable code. The user's JWT is attached automatically.
 */
export async function invokeFunction<T>(
  client: TypedSupabaseClient,
  name: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<{ data: T; status: number }> {
  const { data, error, response } = await client.functions.invoke<T>(name, {
    method: options.method ?? 'POST',
    body: options.body as Record<string, unknown> | undefined,
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      const body = (await res.json().catch(() => null)) as FunctionErrorBody | null;
      const code = body?.error?.code ?? (res.status === 404 ? 'FUNCTION_NOT_DEPLOYED' : 'INTERNAL_ERROR');
      const message =
        body?.error?.message ??
        (code === 'FUNCTION_NOT_DEPLOYED'
          ? 'The payment service is not deployed yet.'
          : (FRIENDLY_MESSAGES[code] ?? FRIENDLY_MESSAGES.INTERNAL_ERROR!));
      throw new AppError(code, message, { details: body?.error?.details, status: res.status, cause: error });
    }
    if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
      throw new AppError('NETWORK_ERROR', FRIENDLY_MESSAGES.NETWORK_ERROR!, { cause: error });
    }
    throw new AppError('INTERNAL_ERROR', FRIENDLY_MESSAGES.INTERNAL_ERROR!, { cause: error });
  }

  return { data: data as T, status: response?.status ?? 200 };
}

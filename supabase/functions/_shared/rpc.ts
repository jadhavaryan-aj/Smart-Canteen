/**
 * A minimal RPC abstraction over Postgres functions. In Edge Functions it is
 * backed by supabase-js (PostgREST); in tests by a direct `pg` connection, so
 * the exact same repository code runs against real SQL in both places.
 */
export interface RpcClient {
  call<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

export class RpcError extends Error {
  /** Machine-readable code raised by our SQL functions (e.g. ITEMS_UNAVAILABLE). */
  readonly code: string;
  readonly sqlState: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(input: {
    code: string;
    message: string;
    sqlState?: string | null;
    details?: string | null;
    hint?: string | null;
  }) {
    super(input.message);
    this.name = 'RpcError';
    this.code = input.code;
    this.sqlState = input.sqlState ?? null;
    this.details = input.details ?? null;
    this.hint = input.hint ?? null;
  }
}

/** Normalises a Postgres/PostgREST error into an RpcError. */
export function toRpcError(error: {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  detail?: string | null;
  hint?: string | null;
}): RpcError {
  const message = error.message ?? 'Database error';
  const sqlState = error.code ?? null;
  const isOurCode = /^[A-Z][A-Z_]+$/.test(message);
  let code = 'DATABASE_ERROR';
  if (isOurCode) code = message;
  else if (sqlState === '42501') code = 'FORBIDDEN';
  else if (sqlState === 'PGRST202') code = 'FUNCTION_NOT_FOUND';
  return new RpcError({
    code,
    message,
    sqlState,
    details: error.details ?? error.detail ?? null,
    hint: error.hint ?? null,
  });
}

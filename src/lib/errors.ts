/** Application error with a stable code and a message safe to show people. */
export class AppError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number | null;

  constructor(code: string, message: string, options: { details?: unknown; status?: number | null; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.details = options.details;
    this.status = options.status ?? null;
  }
}

export const FRIENDLY_MESSAGES: Record<string, string> = {
  SUPABASE_NOT_CONFIGURED: 'The ordering service has not been configured yet.',
  GUEST_AUTH_DISABLED:
    'Guest checkout is not enabled yet. The canteen administrator needs to enable anonymous sign-ins in Supabase.',
  NETWORK_ERROR: 'We could not reach the server. Check your connection and try again.',
  ORDERING_CLOSED: 'Online ordering is closed right now.',
  ITEMS_UNAVAILABLE: 'Some items in your cart are no longer available.',
  MENU_CHANGED: 'The menu changed since this order was created. Please review your cart.',
  ORDER_EXPIRED: 'The payment window for this order has closed. Please place a new order.',
  PAYMENTS_NOT_CONFIGURED: 'Online payments are not set up yet.',
  PAYMENT_PROVIDER_ERROR: 'The payment service is unavailable. Please try again in a moment.',
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
  UNAUTHENTICATED: 'Your session expired. Please refresh the page.',
  FORBIDDEN: 'You do not have permission to do that.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
};

export function messageFor(error: unknown): string {
  if (error instanceof AppError) return error.message || FRIENDLY_MESSAGES[error.code] || FRIENDLY_MESSAGES.INTERNAL_ERROR!;
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return FRIENDLY_MESSAGES.NETWORK_ERROR!;
  return FRIENDLY_MESSAGES.INTERNAL_ERROR!;
}

/** Maps a PostgREST / RPC error (whose message is our machine code) into an AppError. */
export function fromPostgrestError(error: {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}): AppError {
  const isOurCode = /^[A-Z][A-Z_]+$/.test(error.message);
  const code = isOurCode ? error.message : error.code === '42501' ? 'FORBIDDEN' : 'DATABASE_ERROR';
  let details: unknown = error.details ?? undefined;
  if (code === 'ITEMS_UNAVAILABLE' || code === 'MENU_CHANGED') {
    try {
      details = JSON.parse(error.details ?? '[]');
    } catch {
      details = undefined;
    }
  }
  const message = (isOurCode && error.hint) || FRIENDLY_MESSAGES[code] || FRIENDLY_MESSAGES.INTERNAL_ERROR!;
  return new AppError(code, message, { details, cause: error });
}

import { RpcError } from './rpc.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const RPC_STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  ORDER_NOT_FOUND: 404,
  NOT_FOUND: 404,
  ITEMS_UNAVAILABLE: 409,
  MENU_CHANGED: 409,
  ORDERING_CLOSED: 409,
  ORDER_EXPIRED: 409,
  ORDER_NOT_PENDING: 409,
  IDEMPOTENCY_CONFLICT: 409,
  STALE_STATUS: 409,
  INVALID_TRANSITION: 409,
  ORDER_NOT_CANCELLED: 409,
  NOTHING_TO_REFUND: 409,
  REFUND_ALREADY_SUBMITTED: 409,
  REFUND_IN_PROGRESS: 409,
  AMOUNT_MISMATCH: 409,
};

const CLIENT_ERROR_CODES = new Set([
  'INVALID_REQUEST',
  'INVALID_CART',
  'INVALID_QUANTITY',
  'EMPTY_CART',
  'INVALID_CUSTOMER_NAME',
  'INVALID_STUDENT_ID',
  'STUDENT_ID_REQUIRED',
  'TERMS_NOT_ACCEPTED',
  'TOO_MANY_ITEMS',
  'ORDER_TOO_LARGE',
  'REASON_REQUIRED',
]);

function parseDetails(code: string, details: string | null): unknown {
  if (!details) return undefined;
  if (code === 'ITEMS_UNAVAILABLE' || code === 'MENU_CHANGED') {
    try {
      return JSON.parse(details);
    } catch {
      return undefined;
    }
  }
  return details;
}

/** Converts any thrown value into a safe JSON error response. Internal details are never leaked. */
export function errorResponse(error: unknown, headers: Record<string, string>): Response {
  if (error instanceof HttpError) {
    return json(
      { error: { code: error.code, message: error.message, details: error.details } },
      error.status,
      headers,
    );
  }
  if (error instanceof RpcError) {
    const status = RPC_STATUS[error.code] ?? (CLIENT_ERROR_CODES.has(error.code) ? 400 : 500);
    if (status === 500) {
      console.error(
        JSON.stringify({ level: 'error', event: 'rpc_error', code: error.code, sqlState: error.sqlState }),
      );
      return json(
        { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
        500,
        headers,
      );
    }
    return json(
      {
        error: {
          code: error.code,
          message: error.hint ?? 'The request could not be completed.',
          details: parseDetails(error.code, error.details),
        },
      },
      status,
      headers,
    );
  }
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'unhandled_error',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return json(
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
    500,
    headers,
  );
}

/** Reads a JSON body with a size limit. */
export async function readJsonBody(request: Request, maxBytes = 16_384): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected a JSON request body.');
  }
  const text = await readTextBody(request, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
}

export async function readTextBody(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }
  return text;
}

/** Best-effort client IP for rate limiting (set by the Supabase edge proxy). */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || null;
}

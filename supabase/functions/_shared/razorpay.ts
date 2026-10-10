/**
 * Razorpay integration: signature verification and a minimal REST client.
 * Secrets never leave the server. See https://razorpay.com/docs/api/
 */
import { hmacSha256Hex, timingSafeEqual } from './crypto.ts';

export type RazorpayMode = 'test' | 'live';

export function keyMode(keyId: string | null | undefined): RazorpayMode | null {
  if (!keyId) return null;
  if (/^rzp_test_[A-Za-z0-9]+$/.test(keyId)) return 'test';
  if (/^rzp_live_[A-Za-z0-9]+$/.test(keyId)) return 'live';
  return null;
}

/**
 * Checkout callback signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret).
 * Proves the payment id was issued by Razorpay for *our* Razorpay order.
 */
export async function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret: string;
}): Promise<boolean> {
  if (!input.secret || !input.orderId || !input.paymentId || !/^[a-f0-9]{64}$/i.test(input.signature)) {
    return false;
  }
  const expected = await hmacSha256Hex(input.secret, `${input.orderId}|${input.paymentId}`);
  return timingSafeEqual(expected, input.signature.toLowerCase());
}

/** Webhook signature: HMAC-SHA256(raw request body, webhook secret). */
export async function verifyWebhookSignature(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
}): Promise<boolean> {
  if (!input.secret || !input.signature || !/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  const expected = await hmacSha256Hex(input.secret, input.rawBody);
  return timingSafeEqual(expected, input.signature.toLowerCase());
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string | null;
  status: string;
}

export type RazorpayPaymentStatus = 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: RazorpayPaymentStatus;
  method?: string | null;
  captured?: boolean;
  error_code?: string | null;
  error_description?: string | null;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  currency?: string;
  status: 'pending' | 'processed' | 'failed';
  notes?: Record<string, string> | [];
}

export interface RazorpayApi {
  createOrder(input: {
    amount: number;
    currency: 'INR';
    receipt: string;
    notes: Record<string, string>;
  }): Promise<RazorpayOrder>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
  capturePayment(paymentId: string, amount: number, currency: 'INR'): Promise<RazorpayPayment>;
  createRefund(
    paymentId: string,
    input: { amount: number; notes: Record<string, string>; receipt: string },
  ): Promise<RazorpayRefund>;
}

export class RazorpayApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly description: string | null;

  constructor(status: number, code: string | null, description: string | null) {
    super(`Razorpay API error ${status}${code ? ` (${code})` : ''}: ${description ?? 'no description'}`);
    this.name = 'RazorpayApiError';
    this.status = status;
    this.code = code;
    this.description = description;
  }
}

export interface RazorpayClientOptions {
  keyId: string;
  keySecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createRazorpayApi(options: RazorpayClientOptions): RazorpayApi {
  const baseUrl = (options.baseUrl ?? 'https://api.razorpay.com/v1').replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const authorization = `Basic ${btoa(`${options.keyId}:${options.keySecret}`)}`;

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = (data as { error?: { code?: string; description?: string } } | null)?.error;
      throw new RazorpayApiError(response.status, error?.code ?? null, error?.description ?? null);
    }
    return data as T;
  }

  return {
    createOrder: (input) => request<RazorpayOrder>('POST', '/orders', input),
    fetchPayment: (paymentId) => request<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`),
    capturePayment: (paymentId, amount, currency) =>
      request<RazorpayPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency }),
    createRefund: (paymentId, input) =>
      request<RazorpayRefund>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: input.amount,
        speed: 'normal',
        notes: input.notes,
        receipt: input.receipt,
      }),
  };
}

/**
 * Reduces a webhook payload to the fields needed for auditing. Contact
 * details, emails, VPAs and card metadata are deliberately dropped.
 */
export function sanitizeWebhookPayload(body: unknown): Record<string, unknown> {
  const root = (body ?? {}) as {
    event?: unknown;
    created_at?: unknown;
    payload?: {
      payment?: { entity?: Record<string, unknown> };
      order?: { entity?: Record<string, unknown> };
      refund?: { entity?: Record<string, unknown> };
    };
  };
  const pick = (entity: Record<string, unknown> | undefined, keys: string[]) =>
    entity ? Object.fromEntries(keys.filter((key) => key in entity).map((key) => [key, entity[key]])) : undefined;

  return {
    event: typeof root.event === 'string' ? root.event : null,
    created_at: typeof root.created_at === 'number' ? root.created_at : null,
    payment: pick(root.payload?.payment?.entity, [
      'id',
      'order_id',
      'amount',
      'currency',
      'status',
      'method',
      'captured',
      'error_code',
      'error_description',
      'error_reason',
    ]),
    order: pick(root.payload?.order?.entity, ['id', 'amount', 'amount_paid', 'currency', 'status', 'receipt']),
    refund: pick(root.payload?.refund?.entity, ['id', 'payment_id', 'amount', 'currency', 'status']),
  };
}

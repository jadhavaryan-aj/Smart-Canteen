// @vitest-environment node
import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { randomToken, sha256Hex, timingSafeEqual } from './crypto.ts';
import {
  createRazorpayApi,
  keyMode,
  RazorpayApiError,
  sanitizeWebhookPayload,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from './razorpay.ts';

const SECRET = 'test_key_secret';
const hmac = (secret: string, message: string) => createHmac('sha256', secret).update(message).digest('hex');

describe('checkout signature verification', () => {
  const orderId = 'order_Abc123XYZ7890';
  const paymentId = 'pay_Def456UVW1234';
  const valid = hmac(SECRET, `${orderId}|${paymentId}`);

  it('accepts a genuine signature (independent HMAC implementation)', async () => {
    await expect(
      verifyCheckoutSignature({ orderId, paymentId, signature: valid, secret: SECRET }),
    ).resolves.toBe(true);
    await expect(
      verifyCheckoutSignature({ orderId, paymentId, signature: valid.toUpperCase(), secret: SECRET }),
    ).resolves.toBe(true);
  });

  it('rejects a signature made with another secret', async () => {
    const forged = hmac('attacker_secret', `${orderId}|${paymentId}`);
    await expect(
      verifyCheckoutSignature({ orderId, paymentId, signature: forged, secret: SECRET }),
    ).resolves.toBe(false);
  });

  it('rejects a valid signature replayed for a different payment or order', async () => {
    await expect(
      verifyCheckoutSignature({ orderId, paymentId: 'pay_Other000000001', signature: valid, secret: SECRET }),
    ).resolves.toBe(false);
    await expect(
      verifyCheckoutSignature({
        orderId: 'order_Other00000001',
        paymentId,
        signature: valid,
        secret: SECRET,
      }),
    ).resolves.toBe(false);
  });

  it.each(['', 'abc', 'z'.repeat(64), `${valid}00`])('rejects malformed signature %j', async (signature) => {
    await expect(verifyCheckoutSignature({ orderId, paymentId, signature, secret: SECRET })).resolves.toBe(
      false,
    );
  });

  it('fails closed without a secret', async () => {
    await expect(verifyCheckoutSignature({ orderId, paymentId, signature: valid, secret: '' })).resolves.toBe(
      false,
    );
  });
});

describe('webhook signature verification', () => {
  const body = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_1' } } },
  });

  it('accepts the HMAC of the exact raw body', async () => {
    await expect(
      verifyWebhookSignature({ rawBody: body, signature: hmac('whsec', body), secret: 'whsec' }),
    ).resolves.toBe(true);
  });

  it('rejects a body modified after signing', async () => {
    const signature = hmac('whsec', body);
    await expect(
      verifyWebhookSignature({ rawBody: body.replace('captured', 'failed'), signature, secret: 'whsec' }),
    ).resolves.toBe(false);
  });

  it('rejects missing signatures', async () => {
    await expect(verifyWebhookSignature({ rawBody: body, signature: null, secret: 'whsec' })).resolves.toBe(
      false,
    );
  });
});

describe('crypto helpers', () => {
  it('computes SHA-256 like node:crypto', async () => {
    const { createHash } = await import('node:crypto');
    expect(await sha256Hex('receipt-token')).toBe(createHash('sha256').update('receipt-token').digest('hex'));
  });

  it('compares strings correctly', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  it('generates unguessable URL-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => randomToken()));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('Razorpay API client', () => {
  it('authenticates with basic auth and never sends the secret elsewhere', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'order_X', amount: 100, currency: 'INR', status: 'created' })),
    );
    const api = createRazorpayApi({
      keyId: 'rzp_test_abc',
      keySecret: 's3cret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await api.createOrder({ amount: 100, currency: 'INR', receipt: 'CT-1', notes: {} });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa('rzp_test_abc:s3cret')}`,
    );
    expect(String(init.body)).not.toContain('s3cret');
  });

  it('surfaces Razorpay errors', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'BAD_REQUEST_ERROR', description: 'nope' } }), {
          status: 400,
        }),
    );
    const api = createRazorpayApi({
      keyId: 'k',
      keySecret: 's',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(api.fetchPayment('pay_1')).rejects.toBeInstanceOf(RazorpayApiError);
  });
});

describe('helpers', () => {
  it('detects key mode', () => {
    expect(keyMode('rzp_test_abc')).toBe('test');
    expect(keyMode('rzp_live_abc')).toBe('live');
    expect(keyMode('sk_live_abc')).toBeNull();
    expect(keyMode(null)).toBeNull();
  });

  it('strips personal data from webhook payloads before storage', () => {
    const sanitized = sanitizeWebhookPayload({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_1',
            amount: 100,
            email: 'student@example.com',
            contact: '+919999999999',
            vpa: 'student@upi',
            card: { last4: '1111' },
          },
        },
      },
    });
    expect(sanitized.payment).toEqual({ id: 'pay_1', amount: 100 });
    expect(JSON.stringify(sanitized)).not.toMatch(/example\.com|9999|upi|1111/);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { loadPaymentConfig, parseAllowedOrigins } from './config.ts';

const env = (values: Record<string, string>) => (name: string) => values[name];

describe('payment configuration', () => {
  it('is not configured without keys', () => {
    expect(loadPaymentConfig(env({}))).toMatchObject({ configured: false, mode: null });
  });

  it('accepts test keys', () => {
    expect(
      loadPaymentConfig(env({ RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'x' })),
    ).toMatchObject({
      configured: true,
      mode: 'test',
    });
  });

  it('refuses live keys unless explicitly allowed', () => {
    const blocked = loadPaymentConfig(env({ RAZORPAY_KEY_ID: 'rzp_live_abc', RAZORPAY_KEY_SECRET: 'x' }));
    expect(blocked.configured).toBe(false);
    const allowed = loadPaymentConfig(
      env({ RAZORPAY_KEY_ID: 'rzp_live_abc', RAZORPAY_KEY_SECRET: 'x', ALLOW_LIVE_PAYMENTS: 'true' }),
    );
    expect(allowed).toMatchObject({ configured: true, mode: 'live' });
  });

  it('rejects malformed key ids and insecure API URLs', () => {
    expect(loadPaymentConfig(env({ RAZORPAY_KEY_ID: 'abc', RAZORPAY_KEY_SECRET: 'x' })).configured).toBe(
      false,
    );
    expect(
      loadPaymentConfig(
        env({
          RAZORPAY_KEY_ID: 'rzp_test_a',
          RAZORPAY_KEY_SECRET: 'x',
          RAZORPAY_API_BASE_URL: 'http://evil.example/v1',
        }),
      ).configured,
    ).toBe(false);
  });

  it('parses the CORS allowlist', () => {
    expect(parseAllowedOrigins(' https://a.example/ , https://b.example ,, ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

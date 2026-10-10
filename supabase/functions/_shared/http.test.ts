// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { clientIp, errorResponse, HttpError, readJsonBody } from './http.ts';
import { RpcError } from './rpc.ts';

describe('error responses', () => {
  it('maps business errors to safe client responses', async () => {
    const response = errorResponse(
      new RpcError({
        code: 'ITEMS_UNAVAILABLE',
        message: 'ITEMS_UNAVAILABLE',
        details: '[{"code":"sold_out"}]',
        hint: 'Sold out.',
      }),
      {},
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: 'ITEMS_UNAVAILABLE', message: 'Sold out.', details: [{ code: 'sold_out' }] },
    });
  });

  it('hides unexpected database errors', async () => {
    const response = errorResponse(
      new RpcError({ code: 'DATABASE_ERROR', message: 'relation "x" does not exist', hint: 'secret detail' }),
      {},
    );
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain('relation');
    expect(text).not.toContain('secret');
  });

  it('hides unknown exceptions', async () => {
    const response = errorResponse(new Error('stack trace with key rzp_test_abc'), {});
    expect(await response.text()).not.toContain('rzp_test');
  });

  it('passes through HTTP errors', async () => {
    const response = errorResponse(new HttpError(429, 'RATE_LIMITED', 'Slow down'), {});
    expect(response.status).toBe(429);
  });
});

describe('request parsing', () => {
  it('requires JSON and enforces a size limit', async () => {
    await expect(
      readJsonBody(new Request('https://x', { method: 'POST', body: '{}' })),
    ).rejects.toMatchObject({ status: 415 });
    const big = new Request('https://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 'x'.repeat(20_000) }),
    });
    await expect(readJsonBody(big)).rejects.toMatchObject({ status: 413 });
  });

  it('extracts the first forwarded IP', () => {
    expect(
      clientIp(new Request('https://x', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })),
    ).toBe('203.0.113.9');
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { paymentOrderRequestSchema, updateOrderStatusSchema, verifyPaymentSchema } from './validation.ts';

const base = {
  action: 'create',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  items: [{ menuItemId: '5eed0000-0000-4000-b000-000000000101', quantity: 1, optionIds: [] }],
  customer: { name: 'Asha' },
  acceptTerms: true,
};

describe('request validation', () => {
  it('accepts a minimal order', () => {
    expect(paymentOrderRequestSchema.safeParse(base).success).toBe(true);
  });

  it('rejects any attempt to send prices or totals', () => {
    expect(paymentOrderRequestSchema.safeParse({ ...base, totalPaise: 1 }).success).toBe(false);
    expect(
      paymentOrderRequestSchema.safeParse({ ...base, items: [{ ...base.items[0], pricePaise: 1 }] }).success,
    ).toBe(false);
  });

  it.each([0, 21, 1.5, -1])('rejects quantity %s', (quantity) => {
    expect(
      paymentOrderRequestSchema.safeParse({ ...base, items: [{ ...base.items[0], quantity }] }).success,
    ).toBe(false);
  });

  it('requires accepted terms', () => {
    expect(paymentOrderRequestSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
  });

  it('validates payment confirmations strictly', () => {
    const valid = {
      orderId: '00000000-0000-4000-8000-000000000001',
      razorpayOrderId: 'order_Abc123XYZ7890',
      razorpayPaymentId: 'pay_Def456UVW1234',
      razorpaySignature: 'a'.repeat(64),
    };
    expect(verifyPaymentSchema.safeParse(valid).success).toBe(true);
    expect(verifyPaymentSchema.safeParse({ ...valid, status: 'paid' }).success).toBe(false);
    expect(verifyPaymentSchema.safeParse({ ...valid, razorpayPaymentId: 'pay_<script>' }).success).toBe(
      false,
    );
  });

  it('never lets staff request a payment status through this API', () => {
    const request = { action: 'set_status', orderId: '00000000-0000-4000-8000-000000000001' };
    expect(updateOrderStatusSchema.safeParse({ ...request, status: 'confirmed' }).success).toBe(false);
    expect(
      updateOrderStatusSchema.safeParse({ ...request, status: 'preparing', paymentStatus: 'paid' }).success,
    ).toBe(false);
    expect(updateOrderStatusSchema.safeParse({ ...request, status: 'preparing' }).success).toBe(true);
  });
});

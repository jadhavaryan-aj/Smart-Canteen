import { randomUUID } from 'node:crypto';

import { OrdersRepository, type CartLineInput } from '../../functions/_shared/repository.ts';
import { createUser, rpc, sessions, SEED } from './db.ts';

export const serviceRepo = () => new OrdersRepository(rpc(sessions.service()));

export const sampleCart: CartLineInput[] = [
  { menuItemId: SEED.items.masalaDosa, quantity: 2, optionIds: [SEED.options.butterRoast] }, // 2 × ₹80
  { menuItemId: SEED.items.chai, quantity: 1, optionIds: [] }, // ₹15
];
export const SAMPLE_CART_TOTAL = 17500;

/** Creates a student with a pending order (and a Razorpay order id attached). */
export async function createPendingOrderFixture(
  options: { items?: CartLineInput[]; providerOrderId?: string | null; userId?: string } = {},
) {
  const userId = options.userId ?? (await createUser());
  const repo = serviceRepo();
  const order = await repo.createPendingOrder({
    userId,
    idempotencyKey: randomUUID(),
    items: options.items ?? sampleCart,
    customerName: 'Test Student',
    studentIdentifier: null,
    termsAccepted: true,
    accessTokenHash: null,
  });
  let providerOrderId: string | null = null;
  if (options.providerOrderId !== null) {
    providerOrderId = options.providerOrderId ?? `order_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await repo.attachProviderOrder(order.order_id, providerOrderId, order.total_paise);
  }
  return { userId, order, providerOrderId: providerOrderId as string };
}

export function fakePaymentId() {
  return `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

/** Creates a confirmed (paid) order. */
export async function createPaidOrderFixture(options: { items?: CartLineInput[] } = {}) {
  const fixture = await createPendingOrderFixture(options);
  const paymentId = fakePaymentId();
  const result = await serviceRepo().confirmPayment({
    providerOrderId: fixture.providerOrderId,
    providerPaymentId: paymentId,
    amountPaise: fixture.order.total_paise,
    currency: 'INR',
    method: 'upi',
    source: 'checkout',
  });
  if (result.result !== 'confirmed') throw new Error(`fixture confirm failed: ${result.result}`);
  return { ...fixture, paymentId };
}

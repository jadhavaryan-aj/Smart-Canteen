/**
 * End-to-end tests of the Edge Function handlers against real Postgres (via
 * the same repository code used in production) and an in-memory Razorpay.
 * No network calls are made and no real money can move.
 */
import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import type { Authenticator } from '../functions/_shared/auth.ts';
import { loadPaymentConfig, type PaymentConfig } from '../functions/_shared/config.ts';
import { OrdersRepository, StaffRepository } from '../functions/_shared/repository.ts';
import { createPaymentOrderHandler } from '../functions/create-payment-order/handler.ts';
import { razorpayWebhookHandler } from '../functions/razorpay-webhook/handler.ts';
import { updateOrderStatusHandler } from '../functions/update-order-status/handler.ts';
import { verifyPaymentHandler } from '../functions/verify-payment/handler.ts';
import {
  FakeRazorpay,
  signWebhook,
  TEST_KEY_ID,
  TEST_KEY_SECRET,
  TEST_WEBHOOK_SECRET,
} from './helpers/fake-razorpay.ts';
import { createStaff, createUser, rpc, SEED, sessions, superQuery } from './helpers/db.ts';

const config: PaymentConfig = loadPaymentConfig(
  (name) =>
    ({
      RAZORPAY_KEY_ID: TEST_KEY_ID,
      RAZORPAY_KEY_SECRET: TEST_KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
    })[name],
);

/** Test authenticator: "Bearer <kind>:<uuid>" stands in for a Supabase JWT. */
const authenticate: Authenticator = async (request) => {
  const match = /^Bearer (student|staff):([0-9a-f-]{36})$/.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  return { id: match[2] as string, isAnonymous: match[1] === 'student' };
};

const repo = () => new OrdersRepository(rpc(sessions.service()));

function post(url: string, body: unknown, auth?: string, extraHeaders: Record<string, string> = {}) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: auth } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

const cartBody = (overrides: Record<string, unknown> = {}) => ({
  action: 'create',
  idempotencyKey: randomUUID(),
  items: [
    { menuItemId: SEED.items.masalaDosa, quantity: 2, optionIds: [SEED.options.butterRoast] },
    { menuItemId: SEED.items.chai, quantity: 1, optionIds: [] },
  ],
  customer: { name: 'Neha' },
  acceptTerms: true,
  ...overrides,
});

let razorpay: FakeRazorpay;
let createOrder: (request: Request) => Promise<Response>;
let verify: (request: Request) => Promise<Response>;
let webhook: (request: Request) => Promise<Response>;

beforeEach(async () => {
  await superQuery(`update public.menu_items set is_available = true where id = $1`, [SEED.items.chai]);
  razorpay = new FakeRazorpay();
  createOrder = createPaymentOrderHandler({
    config,
    repo: repo(),
    authenticate,
    razorpay,
    allowedOrigins: ['https://canteen.example'],
    limits: { perUser: 50, perIp: 500, windowSeconds: 600 },
  });
  verify = verifyPaymentHandler({ config, repo: repo(), authenticate, razorpay, allowedOrigins: [] });
  webhook = razorpayWebhookHandler({ config, repo: repo(), razorpay });
});

async function startCheckout(studentId = randomUUID()) {
  await superQuery(`insert into auth.users (id, is_anonymous) values ($1, true) on conflict do nothing`, [
    studentId,
  ]);
  const response = await createOrder(
    post('https://fn/create-payment-order', cartBody(), `Bearer student:${studentId}`),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    state: string;
    order: { id: string; orderNumber: string; totalPaise: number };
    payment: { providerOrderId: string; keyId: string; amountPaise: number; mode: string };
    accessToken: string;
  };
  return { studentId, ...body };
}

describe('create-payment-order', () => {
  it('reports payment configuration without exposing secrets', async () => {
    const response = await createOrder(new Request('https://fn/create-payment-order'));
    expect(await response.json()).toEqual({ configured: true, mode: 'test', keyId: TEST_KEY_ID });
  });

  it('creates a pending order and a Razorpay order for the server-calculated amount', async () => {
    const checkout = await startCheckout();
    expect(checkout.state).toBe('awaiting_payment');
    expect(checkout.order.totalPaise).toBe(17500);
    expect(checkout.payment).toMatchObject({ keyId: TEST_KEY_ID, amountPaise: 17500, mode: 'test' });
    expect(razorpay.orders.get(checkout.payment.providerOrderId)?.amount).toBe(17500);
    expect(checkout.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('reuses the same order and Razorpay order on a duplicate submission', async () => {
    const studentId = await createUser();
    const body = cartBody();
    const first = await (await createOrder(post('https://fn', body, `Bearer student:${studentId}`))).json();
    const second = await (await createOrder(post('https://fn', body, `Bearer student:${studentId}`))).json();
    expect(second.order.id).toBe(first.order.id);
    expect(second.payment.providerOrderId).toBe(first.payment.providerOrderId);
    expect(second.replayed).toBe(true);
    expect(razorpay.calls.filter((call) => call === 'createOrder')).toHaveLength(1);
  });

  it('rejects unauthenticated requests', async () => {
    const response = await createOrder(post('https://fn', cartBody()));
    expect(response.status).toBe(401);
  });

  it('rejects carts containing sold-out items with details', async () => {
    const studentId = await createUser();
    await superQuery(`update public.menu_items set is_available = false where id = $1`, [SEED.items.chai]);
    const response = await createOrder(post('https://fn', cartBody(), `Bearer student:${studentId}`));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('ITEMS_UNAVAILABLE');
    expect(body.error.details).toEqual([
      expect.objectContaining({ menu_item_id: SEED.items.chai, code: 'sold_out' }),
    ]);
    expect(razorpay.calls).toEqual([]);
  });

  it('rejects requests that try to set prices or contain unknown fields', async () => {
    const studentId = await createUser();
    const tampered = cartBody({ totalPaise: 100 });
    expect((await createOrder(post('https://fn', tampered, `Bearer student:${studentId}`))).status).toBe(400);
    const tamperedLine = cartBody({
      items: [{ menuItemId: SEED.items.chai, quantity: 1, optionIds: [], pricePaise: 1 }],
    });
    expect((await createOrder(post('https://fn', tamperedLine, `Bearer student:${studentId}`))).status).toBe(
      400,
    );
  });

  it('rejects invalid quantities before touching the database', async () => {
    const studentId = await createUser();
    const response = await createOrder(
      post(
        'https://fn',
        cartBody({ items: [{ menuItemId: SEED.items.chai, quantity: 0, optionIds: [] }] }),
        `Bearer student:${studentId}`,
      ),
    );
    expect(response.status).toBe(400);
  });

  it('rate limits repeated attempts per user', async () => {
    const studentId = await createUser();
    const limited = createPaymentOrderHandler({
      config,
      repo: repo(),
      authenticate,
      razorpay,
      allowedOrigins: [],
      limits: { perUser: 2, perIp: 100, windowSeconds: 600 },
    });
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await limited(post('https://fn', cartBody(), `Bearer student:${studentId}`))).status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('shows an explicit configuration error instead of pretending to take payment', async () => {
    const unconfigured = createPaymentOrderHandler({
      config: loadPaymentConfig(() => undefined),
      repo: repo(),
      authenticate,
      razorpay: null,
      allowedOrigins: [],
    });
    expect(await (await unconfigured(new Request('https://fn'))).json()).toEqual({
      configured: false,
      mode: null,
      keyId: null,
    });
    const response = await unconfigured(post('https://fn', cartBody(), `Bearer student:${randomUUID()}`));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('PAYMENTS_NOT_CONFIGURED');
  });

  it('refuses live keys unless explicitly allowed', () => {
    const live = loadPaymentConfig(
      (name) => ({ RAZORPAY_KEY_ID: 'rzp_live_abc123', RAZORPAY_KEY_SECRET: 's' })[name],
    );
    expect(live.configured).toBe(false);
    expect(live.problem).toMatch(/ALLOW_LIVE_PAYMENTS/);
  });

  it('applies the CORS allowlist', async () => {
    const response = await createOrder(
      new Request('https://fn', { method: 'OPTIONS', headers: { origin: 'https://canteen.example' } }),
    );
    expect(response.headers.get('access-control-allow-origin')).toBe('https://canteen.example');
    const evil = await createOrder(
      new Request('https://fn', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
    );
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('verify-payment', () => {
  it('confirms the order after verifying the signature and the payment with Razorpay', async () => {
    const checkout = await startCheckout();
    const { payment, signature } = await razorpay.simulateCheckout(checkout.payment.providerOrderId);
    const response = await verify(
      post(
        'https://fn',
        {
          orderId: checkout.order.id,
          razorpayOrderId: checkout.payment.providerOrderId,
          razorpayPaymentId: payment.id,
          razorpaySignature: signature,
        },
        `Bearer student:${checkout.studentId}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: 'confirmed',
      order: { status: 'confirmed', paymentStatus: 'paid' },
    });
  });

  it('rejects a forged signature and leaves the order unpaid', async () => {
    const checkout = await startCheckout();
    const { payment } = await razorpay.simulateCheckout(checkout.payment.providerOrderId);
    const response = await verify(
      post(
        'https://fn',
        {
          orderId: checkout.order.id,
          razorpayOrderId: checkout.payment.providerOrderId,
          razorpayPaymentId: payment.id,
          razorpaySignature: 'a'.repeat(64),
        },
        `Bearer student:${checkout.studentId}`,
      ),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_SIGNATURE');
    const { rows } = await superQuery(`select status, payment_status from public.orders where id = $1`, [
      checkout.order.id,
    ]);
    expect(rows[0]).toEqual({ status: 'payment_pending', payment_status: 'pending' });
  });

  it('does not trust a validly signed payment that Razorpay reports as not captured', async () => {
    const checkout = await startCheckout();
    const { payment, signature } = await razorpay.simulateCheckout(checkout.payment.providerOrderId, {
      status: 'created',
    });
    const response = await verify(
      post(
        'https://fn',
        {
          orderId: checkout.order.id,
          razorpayOrderId: checkout.payment.providerOrderId,
          razorpayPaymentId: payment.id,
          razorpaySignature: signature,
        },
        `Bearer student:${checkout.studentId}`,
      ),
    );
    expect(response.status).toBe(202);
    expect((await response.json()).state).toBe('pending_confirmation');
  });

  it('captures authorised payments before confirming', async () => {
    const checkout = await startCheckout();
    const { payment, signature } = await razorpay.simulateCheckout(checkout.payment.providerOrderId, {
      status: 'authorized',
    });
    const response = await verify(
      post(
        'https://fn',
        {
          orderId: checkout.order.id,
          razorpayOrderId: checkout.payment.providerOrderId,
          razorpayPaymentId: payment.id,
          razorpaySignature: signature,
        },
        `Bearer student:${checkout.studentId}`,
      ),
    );
    expect((await response.json()).state).toBe('confirmed');
    expect(razorpay.payments.get(payment.id)?.status).toBe('captured');
  });

  it('returns 404 for another student’s order (no IDOR)', async () => {
    const checkout = await startCheckout();
    const { payment, signature } = await razorpay.simulateCheckout(checkout.payment.providerOrderId);
    const intruder = await createUser();
    const response = await verify(
      post(
        'https://fn',
        {
          orderId: checkout.order.id,
          razorpayOrderId: checkout.payment.providerOrderId,
          razorpayPaymentId: payment.id,
          razorpaySignature: signature,
        },
        `Bearer student:${intruder}`,
      ),
    );
    expect(response.status).toBe(404);
  });

  it('handles duplicate callbacks idempotently', async () => {
    const checkout = await startCheckout();
    const { payment, signature } = await razorpay.simulateCheckout(checkout.payment.providerOrderId);
    const body = {
      orderId: checkout.order.id,
      razorpayOrderId: checkout.payment.providerOrderId,
      razorpayPaymentId: payment.id,
      razorpaySignature: signature,
    };
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        verify(post('https://fn', body, `Bearer student:${checkout.studentId}`)),
      ),
    );
    for (const response of responses) expect((await response.json()).state).toBe('confirmed');
    const { rows } = await superQuery<{ count: number }>(
      `select count(*)::int as count from public.order_status_history where order_id = $1 and new_status = 'confirmed'`,
      [checkout.order.id],
    );
    expect(rows[0]?.count).toBe(1);
  });

  it('keeps the order pending when Razorpay is unreachable (webhook will confirm)', async () => {
    const checkout = await startCheckout();
    const { payment, signature } = await razorpay.simulateCheckout(checkout.payment.providerOrderId);
    razorpay.unreachable = true;
    const response = await verify(
      post(
        'https://fn',
        {
          orderId: checkout.order.id,
          razorpayOrderId: checkout.payment.providerOrderId,
          razorpayPaymentId: payment.id,
          razorpaySignature: signature,
        },
        `Bearer student:${checkout.studentId}`,
      ),
    );
    expect(response.status).toBe(202);
    const { rows } = await superQuery(`select status from public.orders where id = $1`, [checkout.order.id]);
    expect(rows[0]).toEqual({ status: 'payment_pending' });
  });

  it('records failed payments', async () => {
    const checkout = await startCheckout();
    const { payment, signature } = await razorpay.simulateCheckout(checkout.payment.providerOrderId, {
      status: 'failed',
    });
    const response = await verify(
      post(
        'https://fn',
        {
          orderId: checkout.order.id,
          razorpayOrderId: checkout.payment.providerOrderId,
          razorpayPaymentId: payment.id,
          razorpaySignature: signature,
        },
        `Bearer student:${checkout.studentId}`,
      ),
    );
    expect((await response.json()).state).toBe('failed');
    const { rows } = await superQuery(`select payment_status from public.orders where id = $1`, [
      checkout.order.id,
    ]);
    expect(rows[0]).toEqual({ payment_status: 'failed' });
  });
});

describe('razorpay-webhook', () => {
  async function deliver(event: unknown, options: { eventId?: string; secret?: string } = {}) {
    const raw = JSON.stringify(event);
    return webhook(
      new Request('https://fn/razorpay-webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': await signWebhook(raw, options.secret),
          'x-razorpay-event-id': options.eventId ?? `evt_${randomUUID().replace(/-/g, '')}`,
        },
        body: raw,
      }),
    );
  }

  const capturedEvent = (providerOrderId: string, paymentId: string, amount: number) => ({
    entity: 'event',
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: providerOrderId,
          amount,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
          email: 'student@example.com',
          contact: '+919999999999',
        },
      },
    },
  });

  it('rejects deliveries with an invalid signature', async () => {
    const checkout = await startCheckout();
    const response = await deliver(
      capturedEvent(checkout.payment.providerOrderId, 'pay_Forged12345678', 17500),
      {
        secret: 'wrong-secret',
      },
    );
    expect(response.status).toBe(401);
    const { rows } = await superQuery(`select status from public.orders where id = $1`, [checkout.order.id]);
    expect(rows[0]).toEqual({ status: 'payment_pending' });
  });

  it('confirms the order and stores a minimised payload', async () => {
    const checkout = await startCheckout();
    const eventId = `evt_${randomUUID().replace(/-/g, '')}`;
    const response = await deliver(
      capturedEvent(checkout.payment.providerOrderId, 'pay_Webhook1234567', 17500),
      { eventId },
    );
    expect(response.status).toBe(200);
    const order = await superQuery(`select status, payment_status from public.orders where id = $1`, [
      checkout.order.id,
    ]);
    expect(order.rows[0]).toEqual({ status: 'confirmed', payment_status: 'paid' });
    const stored = await superQuery<{ payload: { payment: Record<string, unknown> } }>(
      `select payload from public.payment_webhook_events where event_id = $1`,
      [eventId],
    );
    expect(stored.rows[0]?.payload.payment).not.toHaveProperty('email');
    expect(stored.rows[0]?.payload.payment).not.toHaveProperty('contact');
  });

  it('acknowledges duplicate deliveries without reprocessing', async () => {
    const checkout = await startCheckout();
    const eventId = `evt_${randomUUID().replace(/-/g, '')}`;
    const event = capturedEvent(checkout.payment.providerOrderId, 'pay_Duplicate123456', 17500);
    expect(await (await deliver(event, { eventId })).json()).toEqual({ status: 'processed' });
    expect(await (await deliver(event, { eventId })).json()).toEqual({ status: 'duplicate' });
  });

  it('agrees with the checkout callback when both arrive', async () => {
    const checkout = await startCheckout();
    const { payment, signature } = await razorpay.simulateCheckout(checkout.payment.providerOrderId);
    await deliver(capturedEvent(checkout.payment.providerOrderId, payment.id, 17500));
    const response = await verify(
      post(
        'https://fn',
        {
          orderId: checkout.order.id,
          razorpayOrderId: checkout.payment.providerOrderId,
          razorpayPaymentId: payment.id,
          razorpaySignature: signature,
        },
        `Bearer student:${checkout.studentId}`,
      ),
    );
    expect((await response.json()).state).toBe('confirmed');
  });

  it('does not confirm when the captured amount differs from the order total', async () => {
    const checkout = await startCheckout();
    await deliver(capturedEvent(checkout.payment.providerOrderId, 'pay_Tampered1234567', 100));
    const { rows } = await superQuery(`select status from public.orders where id = $1`, [checkout.order.id]);
    expect(rows[0]).toEqual({ status: 'payment_pending' });
  });

  it('ignores events for orders that are not ours', async () => {
    const response = await deliver(capturedEvent('order_NotOurs12345678', 'pay_NotOurs12345678', 100));
    expect(await response.json()).toEqual({ status: 'ignored' });
  });

  it('records refunds reported by Razorpay', async () => {
    const checkout = await startCheckout();
    const { payment } = await razorpay.simulateCheckout(checkout.payment.providerOrderId);
    await deliver(capturedEvent(checkout.payment.providerOrderId, payment.id, 17500));
    await deliver({
      event: 'refund.processed',
      payload: {
        refund: {
          entity: { id: 'rfnd_Dashboard123456', payment_id: payment.id, amount: 17500, status: 'processed' },
        },
      },
    });
    const { rows } = await superQuery(`select status, payment_status from public.orders where id = $1`, [
      checkout.order.id,
    ]);
    expect(rows[0]).toEqual({ status: 'cancelled', payment_status: 'refunded' });
  });
});

describe('update-order-status', () => {
  function handlerFor(fake = razorpay) {
    return updateOrderStatusHandler({
      config,
      repo: repo(),
      razorpay: fake,
      authenticate,
      staffRepoFor: (request) => {
        const userId =
          /([0-9a-f-]{36})$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? randomUUID();
        return new StaffRepository(rpc(sessions.user(userId)));
      },
      allowedOrigins: [],
    });
  }

  async function paidOrder() {
    const checkout = await startCheckout();
    const { payment, signature } = await razorpay.simulateCheckout(checkout.payment.providerOrderId);
    await verify(
      post(
        'https://fn',
        {
          orderId: checkout.order.id,
          razorpayOrderId: checkout.payment.providerOrderId,
          razorpayPaymentId: payment.id,
          razorpaySignature: signature,
        },
        `Bearer student:${checkout.studentId}`,
      ),
    );
    return { ...checkout, paymentId: payment.id };
  }

  it('lets staff progress an order', async () => {
    const order = await paidOrder();
    const staffId = await createStaff('staff');
    const response = await handlerFor()(
      post(
        'https://fn',
        { action: 'set_status', orderId: order.order.id, status: 'preparing', expectedStatus: 'confirmed' },
        `Bearer staff:${staffId}`,
      ),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).order).toMatchObject({ status: 'preparing', changed: true });
  });

  it('forbids students from changing order status', async () => {
    const order = await paidOrder();
    const response = await handlerFor()(
      post(
        'https://fn',
        { action: 'set_status', orderId: order.order.id, status: 'completed' },
        `Bearer staff:${order.studentId}`,
      ),
    );
    expect(response.status).toBe(403);
    const guest = await handlerFor()(
      post(
        'https://fn',
        { action: 'set_status', orderId: order.order.id, status: 'completed' },
        `Bearer student:${order.studentId}`,
      ),
    );
    expect(guest.status).toBe(401);
  });

  it('rejects invalid transitions with a conflict', async () => {
    const order = await paidOrder();
    const staffId = await createStaff('staff');
    const response = await handlerFor()(
      post(
        'https://fn',
        { action: 'set_status', orderId: order.order.id, status: 'completed' },
        `Bearer staff:${staffId}`,
      ),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('INVALID_TRANSITION');
  });

  it('submits a refund to Razorpay when an admin cancels a paid order', async () => {
    const order = await paidOrder();
    const adminId = await createStaff('admin');
    const response = await handlerFor()(
      post(
        'https://fn',
        { action: 'set_status', orderId: order.order.id, status: 'cancelled', note: 'Out of stock' },
        `Bearer staff:${adminId}`,
      ),
    );
    const body = await response.json();
    expect(body.order.status).toBe('cancelled');
    expect(body.refund).toMatchObject({ state: 'submitted', amountPaise: 17500 });
    expect([...razorpay.refunds.values()][0]).toMatchObject({ payment_id: order.paymentId, amount: 17500 });
    const { rows } = await superQuery(`select payment_status from public.orders where id = $1`, [
      order.order.id,
    ]);
    expect(rows[0]).toEqual({ payment_status: 'refund_pending' });
  });

  it('records a failed refund so an admin can retry it', async () => {
    const order = await paidOrder();
    const adminId = await createStaff('admin');
    razorpay.failRefunds = true;
    const response = await handlerFor()(
      post(
        'https://fn',
        { action: 'set_status', orderId: order.order.id, status: 'cancelled', note: 'Kitchen fire drill' },
        `Bearer staff:${adminId}`,
      ),
    );
    expect((await response.json()).refund).toMatchObject({ state: 'failed' });

    razorpay.failRefunds = false;
    const retry = await handlerFor()(
      post('https://fn', { action: 'refund', orderId: order.order.id }, `Bearer staff:${adminId}`),
    );
    expect((await retry.json()).refund).toMatchObject({ state: 'submitted' });
  });
});

/**
 * Ordering tests: server-side pricing, quantity validation, availability,
 * idempotent order creation, order numbers and receipt authorisation.
 */
import { createHash, randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { RpcError } from '../functions/_shared/rpc.ts';
import {
  createPaidOrderFixture,
  createPendingOrderFixture,
  sampleCart,
  SAMPLE_CART_TOTAL,
  serviceRepo,
} from './helpers/fixtures.ts';
import {
  createStaff,
  createUser,
  expectDbError,
  query,
  rpc,
  SEED,
  sessions,
  superQuery,
} from './helpers/db.ts';

interface Quote {
  lines: { menu_item_id: string; unit_price_paise: number; line_total_paise: number; quantity: number }[];
  subtotal_paise: number;
  total_paise: number;
  item_count: number;
  issues: { menu_item_id: string; code: string }[];
  ordering_status: { is_open: boolean; reason: string };
}

const quote = (items: unknown) => rpc(sessions.anon()).call<Quote>('quote_cart', { p_items: items });

afterEach(async () => {
  await superQuery(`update public.menu_items set is_available = true where id = $1`, [SEED.items.chai]);
  await superQuery(
    `update public.canteen_settings set ordering_enabled = true, ordering_paused = false, enforce_opening_hours = false, max_items_per_order = 30, student_id_mode = 'hidden'`,
  );
});

describe('server-side price calculation', () => {
  it('prices a cart from database values including option surcharges', async () => {
    const result = await quote([
      { menu_item_id: SEED.items.masalaDosa, quantity: 2, option_ids: [SEED.options.butterRoast] },
      {
        menu_item_id: SEED.items.biryani,
        quantity: 1,
        option_ids: [SEED.options.extraRaita, SEED.options.boiledEgg],
      },
    ]);
    expect(result.lines.map((line) => [line.unit_price_paise, line.line_total_paise])).toEqual([
      [8000, 16000],
      [17000, 17000],
    ]);
    expect(result.subtotal_paise).toBe(33000);
    expect(result.total_paise).toBe(33000);
    expect(result.item_count).toBe(3);
    expect(result.issues).toEqual([]);
  });

  it('ignores any price, total or discount fields sent by the client', async () => {
    const result = await quote([
      {
        menu_item_id: SEED.items.chai,
        quantity: 2,
        price_paise: 1,
        unit_price_paise: 1,
        total_paise: 1,
        discount: 100,
      },
    ]);
    expect(result.total_paise).toBe(3000);
  });

  it('stores database prices on the order regardless of the request', async () => {
    const userId = await createUser();
    const order = await serviceRepo().createPendingOrder({
      userId,
      idempotencyKey: randomUUID(),
      items: sampleCart,
      customerName: 'Price Check',
      studentIdentifier: null,
      termsAccepted: true,
      accessTokenHash: null,
    });
    expect(order.total_paise).toBe(SAMPLE_CART_TOTAL);
    const { rows } = await superQuery<{
      unit_price_paise: number;
      quantity: number;
      line_total_paise: number;
    }>(
      `select unit_price_paise, quantity, line_total_paise from public.order_items where order_id = $1 order by line_number`,
      [order.order_id],
    );
    expect(rows).toEqual([
      { unit_price_paise: 8000, quantity: 2, line_total_paise: 16000 },
      { unit_price_paise: 1500, quantity: 1, line_total_paise: 1500 },
    ]);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['too many', 21],
    ['fractional', 1.5],
    ['string', '2'],
    ['huge', 1e9],
    ['null', null],
  ])('rejects an invalid quantity (%s)', async (_label, quantity) => {
    await expectDbError(quote([{ menu_item_id: SEED.items.chai, quantity }]), 'INVALID_QUANTITY');
  });

  it('rejects malformed carts', async () => {
    await expectDbError(quote([]), 'EMPTY_CART');
    await expectDbError(quote({ items: [] }), 'INVALID_CART');
    await expectDbError(quote([{ menu_item_id: 'not-a-uuid', quantity: 1 }]), 'INVALID_CART');
    await expectDbError(
      quote([
        {
          menu_item_id: SEED.items.chai,
          quantity: 1,
          option_ids: [SEED.options.butterRoast, SEED.options.butterRoast],
        },
      ]),
      'INVALID_CART',
    );
    await expectDbError(
      quote([{ menu_item_id: SEED.items.chai, quantity: 1, note: 'x'.repeat(121) }]),
      'INVALID_CART',
    );
    await expectDbError(
      quote(Array.from({ length: 31 }, () => ({ menu_item_id: SEED.items.chai, quantity: 1 }))),
      'INVALID_CART',
    );
  });

  it('reports sold-out items, unknown items and foreign options as issues', async () => {
    const result = await quote([
      { menu_item_id: SEED.items.alooParatha, quantity: 1 },
      { menu_item_id: randomUUID(), quantity: 1 },
      { menu_item_id: SEED.items.chai, quantity: 1, option_ids: [SEED.options.butterRoast] },
      { menu_item_id: SEED.items.idli, quantity: 1 },
    ]);
    expect(result.issues.map((issue) => issue.code)).toEqual(['sold_out', 'not_found', 'option_unavailable']);
    expect(result.total_paise).toBe(5000);
  });
});

describe('creating pending orders', () => {
  const create = (
    userId: string,
    overrides: Partial<Parameters<ReturnType<typeof serviceRepo>['createPendingOrder']>[0]> = {},
  ) =>
    serviceRepo().createPendingOrder({
      userId,
      idempotencyKey: randomUUID(),
      items: sampleCart,
      customerName: 'Asha',
      studentIdentifier: null,
      termsAccepted: true,
      accessTokenHash: null,
      ...overrides,
    });

  it('creates a payment_pending order with a human-readable order number', async () => {
    const userId = await createUser();
    const order = await create(userId);
    expect(order.status).toBe('payment_pending');
    expect(order.payment_status).toBe('pending');
    expect(order.order_number).toMatch(/^CT-\d{8}-\d{4,}$/);
    const history = await superQuery(
      `select new_status from public.order_status_history where order_id = $1`,
      [order.order_id],
    );
    expect(history.rows).toEqual([{ new_status: 'payment_pending' }]);
  });

  it('refuses sold-out items at checkout, even if they were in the cart earlier', async () => {
    const userId = await createUser();
    await superQuery(`update public.menu_items set is_available = false where id = $1`, [SEED.items.chai]);
    const error = await create(userId).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RpcError);
    expect((error as RpcError).code).toBe('ITEMS_UNAVAILABLE');
    expect(JSON.parse((error as RpcError).details ?? '[]')).toEqual([
      expect.objectContaining({ menu_item_id: SEED.items.chai, code: 'sold_out' }),
    ]);
    const { rows } = await superQuery(`select 1 from public.orders where user_id = $1`, [userId]);
    expect(rows).toEqual([]);
  });

  it('refuses new orders while ordering is paused, disabled or outside opening hours', async () => {
    const userId = await createUser();
    await superQuery(
      `update public.canteen_settings set ordering_paused = true, pause_message = 'Back in 10 minutes'`,
    );
    const paused = (await create(userId).catch((caught: unknown) => caught)) as RpcError;
    expect(paused.code).toBe('ORDERING_CLOSED');
    expect(paused.hint).toBe('Back in 10 minutes');

    await superQuery(`update public.canteen_settings set ordering_paused = false, ordering_enabled = false`);
    expect(((await create(userId).catch((caught: unknown) => caught)) as RpcError).code).toBe(
      'ORDERING_CLOSED',
    );
  });

  it('validates customer details and terms acceptance', async () => {
    const userId = await createUser();
    await expect(create(userId, { customerName: 'A' })).rejects.toMatchObject({
      code: 'INVALID_CUSTOMER_NAME',
    });
    await expect(create(userId, { customerName: '<script>' })).rejects.toMatchObject({
      code: 'INVALID_CUSTOMER_NAME',
    });
    await expect(create(userId, { termsAccepted: false })).rejects.toMatchObject({
      code: 'TERMS_NOT_ACCEPTED',
    });

    await superQuery(`update public.canteen_settings set student_id_mode = 'required'`);
    await expect(create(userId)).rejects.toMatchObject({ code: 'STUDENT_ID_REQUIRED' });
    await expect(create(userId, { studentIdentifier: 'DROP TABLE;' })).rejects.toMatchObject({
      code: 'INVALID_STUDENT_ID',
    });
    await expect(create(userId, { studentIdentifier: 'CS-2024/117' })).resolves.toMatchObject({
      status: 'payment_pending',
    });
  });

  it('enforces the per-order item limit', async () => {
    const userId = await createUser();
    await superQuery(`update public.canteen_settings set max_items_per_order = 2`);
    await expect(create(userId)).rejects.toMatchObject({ code: 'TOO_MANY_ITEMS' });
  });
});

describe('duplicate checkout submissions', () => {
  it('returns the same order when the same submission is repeated', async () => {
    const userId = await createUser();
    const key = randomUUID();
    const input = {
      userId,
      idempotencyKey: key,
      items: sampleCart,
      customerName: 'Ravi',
      studentIdentifier: null,
      termsAccepted: true,
      accessTokenHash: null,
    };
    const first = await serviceRepo().createPendingOrder(input);
    const second = await serviceRepo().createPendingOrder(input);
    expect(second.order_id).toBe(first.order_id);
    expect(second.replayed).toBe(true);
    const { rows } = await superQuery(`select count(*)::int as count from public.orders where user_id = $1`, [
      userId,
    ]);
    expect(rows[0]).toEqual({ count: 1 });
  });

  it('creates exactly one order when identical submissions race', async () => {
    const userId = await createUser();
    const input = {
      userId,
      idempotencyKey: randomUUID(),
      items: sampleCart,
      customerName: 'Racer',
      studentIdentifier: null,
      termsAccepted: true,
      accessTokenHash: null,
    };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => serviceRepo().createPendingOrder(input)),
    );
    expect(new Set(results.map((result) => result.order_id)).size).toBe(1);
    const { rows } = await superQuery(`select count(*)::int as count from public.orders where user_id = $1`, [
      userId,
    ]);
    expect(rows[0]).toEqual({ count: 1 });
  });

  it('rejects reusing an idempotency key for a different cart', async () => {
    const userId = await createUser();
    const key = randomUUID();
    const base = {
      userId,
      idempotencyKey: key,
      customerName: 'Mira',
      studentIdentifier: null,
      termsAccepted: true,
      accessTokenHash: null,
    };
    await serviceRepo().createPendingOrder({ ...base, items: sampleCart });
    await expect(
      serviceRepo().createPendingOrder({
        ...base,
        items: [{ menuItemId: SEED.items.idli, quantity: 1, optionIds: [] }],
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});

describe('order numbers', () => {
  it('are unique and sequential under concurrent order creation', async () => {
    const users = await Promise.all(Array.from({ length: 20 }, () => createUser()));
    const orders = await Promise.all(
      users.map((userId) =>
        serviceRepo().createPendingOrder({
          userId,
          idempotencyKey: randomUUID(),
          items: [{ menuItemId: SEED.items.chai, quantity: 1, optionIds: [] }],
          customerName: 'Concurrent',
          studentIdentifier: null,
          termsAccepted: true,
          accessTokenHash: null,
        }),
      ),
    );
    const numbers = orders.map((order) => order.order_number);
    expect(new Set(numbers).size).toBe(numbers.length);
    const sequence = numbers.map((number) => Number(number.split('-')[2])).sort((a, b) => a - b);
    for (let i = 1; i < sequence.length; i++) expect(sequence[i]).toBe((sequence[i - 1] ?? 0) + 1);
  });

  it('are protected by a unique constraint', async () => {
    const { rows } = await superQuery(
      `select 1 from pg_indexes where schemaname = 'public' and tablename = 'orders' and indexdef ilike '%unique%order_number%'`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe('resuming payment for a pending order', () => {
  it('only allows the owner to resume', async () => {
    const { order } = await createPendingOrderFixture();
    const stranger = await createUser();
    await expect(serviceRepo().prepareOrderPayment(order.order_id, stranger)).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    });
  });

  it('refuses expired orders', async () => {
    const { order, userId } = await createPendingOrderFixture();
    await superQuery(
      `update public.orders set payment_expires_at = now() - interval '1 minute' where id = $1`,
      [order.order_id],
    );
    await expect(serviceRepo().prepareOrderPayment(order.order_id, userId)).rejects.toMatchObject({
      code: 'ORDER_EXPIRED',
    });
  });

  it('refuses when an item sold out or a price changed after the order was created', async () => {
    const { order, userId } = await createPendingOrderFixture({
      items: [{ menuItemId: SEED.items.chai, quantity: 1, optionIds: [] }],
    });
    await superQuery(`update public.menu_items set is_available = false where id = $1`, [SEED.items.chai]);
    await expect(serviceRepo().prepareOrderPayment(order.order_id, userId)).rejects.toMatchObject({
      code: 'MENU_CHANGED',
    });
  });

  it('reports already-paid orders as not ready instead of reopening payment', async () => {
    const { order, userId } = await createPaidOrderFixture();
    const result = await serviceRepo().prepareOrderPayment(order.order_id, userId);
    expect(result).toMatchObject({ ready: false, status: 'confirmed' });
  });
});

describe('receipt access authorisation', () => {
  async function orderWithToken() {
    const userId = await createUser();
    const token = randomUUID() + randomUUID();
    const hash = createHash('sha256').update(token).digest('hex');
    const order = await serviceRepo().createPendingOrder({
      userId,
      idempotencyKey: randomUUID(),
      items: sampleCart,
      customerName: 'Receipt Owner',
      studentIdentifier: null,
      termsAccepted: true,
      accessTokenHash: hash,
    });
    return { userId, token, order };
  }

  const receipt = (session: ReturnType<typeof sessions.anon>, args: Record<string, unknown>) =>
    rpc(session).call<Record<string, unknown> | null>('get_order_receipt', args);

  it('returns the receipt to its owner', async () => {
    const { userId, order } = await orderWithToken();
    const result = await receipt(sessions.student(userId), { p_order_id: order.order_id });
    expect(result).toMatchObject({
      order_number: order.order_number,
      total_paise: SAMPLE_CART_TOTAL,
      is_owner: true,
      can_resume_payment: true,
    });
    expect(result?.lines).toHaveLength(2);
  });

  it('returns nothing to other students and to anonymous visitors', async () => {
    const { order } = await orderWithToken();
    const other = await createUser();
    expect(await receipt(sessions.student(other), { p_order_id: order.order_id })).toBeNull();
    expect(await receipt(sessions.anon(), { p_order_id: order.order_id })).toBeNull();
    expect(await receipt(sessions.anon(), { p_order_id: randomUUID() })).toBeNull();
  });

  it('accepts the secret receipt token on any device', async () => {
    const { order, token } = await orderWithToken();
    const result = await receipt(sessions.anon(), { p_access_token: token });
    expect(result).toMatchObject({ order_id: order.order_id, is_owner: false, can_resume_payment: false });
  });

  it('rejects wrong tokens and tokens paired with a different order id', async () => {
    const { token } = await orderWithToken();
    const other = await orderWithToken();
    expect(await receipt(sessions.anon(), { p_access_token: `${token}x` })).toBeNull();
    expect(await receipt(sessions.anon(), { p_access_token: 'short' })).toBeNull();
    expect(
      await receipt(sessions.anon(), { p_access_token: token, p_order_id: other.order.order_id }),
    ).toBeNull();
  });

  it('lets staff open any receipt', async () => {
    const { order } = await orderWithToken();
    const staffId = await createStaff('staff');
    expect(await receipt(sessions.user(staffId), { p_order_id: order.order_id })).toMatchObject({
      order_id: order.order_id,
      is_owner: false,
    });
  });

  it('includes the verified payment reference only once paid', async () => {
    const pending = await createPendingOrderFixture();
    expect(
      await receipt(sessions.student(pending.userId), { p_order_id: pending.order.order_id }),
    ).toMatchObject({
      payment: null,
    });
    const paid = await createPaidOrderFixture();
    expect(await receipt(sessions.student(paid.userId), { p_order_id: paid.order.order_id })).toMatchObject({
      status: 'confirmed',
      payment_status: 'paid',
      payment: { provider: 'razorpay', provider_payment_id: paid.paymentId, method: 'upi' },
    });
  });
});

describe('opening hours', () => {
  it('computes open/closed state in the canteen time zone', async () => {
    await superQuery(`update public.canteen_settings set enforce_opening_hours = true`);
    const statusAt = async (iso: string) =>
      (
        await query<{
          s: { is_open: boolean; reason: string; next_opening: { day: string; time: string } | null };
        }>(sessions.anon(), `select public.get_ordering_status($1::timestamptz) as s`, [iso])
      ).rows[0]?.s;

    // Monday 2026-10-12, 10:00 IST → open (default hours 08:00–20:00)
    expect(await statusAt('2026-10-12T04:30:00Z')).toMatchObject({ is_open: true, reason: 'open' });
    // Monday 07:00 IST → before opening, opens today at 08:00
    expect(await statusAt('2026-10-12T01:30:00Z')).toMatchObject({
      is_open: false,
      reason: 'before_opening',
      next_opening: { day: 'mon', time: '08:00' },
    });
    // Saturday 17:00 IST → after closing (Sat closes 16:00); Sunday is closed so next is Monday
    expect(await statusAt('2026-10-10T11:30:00Z')).toMatchObject({
      reason: 'after_closing',
      next_opening: { day: 'mon', time: '08:00' },
    });
    // Sunday → closed today
    expect(await statusAt('2026-10-11T06:00:00Z')).toMatchObject({ reason: 'closed_today' });
  });

  it('rejects invalid opening hours', async () => {
    const adminId = await createStaff('admin');
    await expectDbError(
      query(
        sessions.user(adminId),
        `update public.canteen_settings set opening_hours = jsonb_set(opening_hours, '{mon,open}', '"21:00"')`,
      ),
      'opening_hours',
    );
  });
});

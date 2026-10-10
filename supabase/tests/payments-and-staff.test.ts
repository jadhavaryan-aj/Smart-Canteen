/**
 * Payment confirmation (idempotency, duplicates, mismatches), refunds, staff
 * status transitions and dashboard revenue.
 */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { StaffRepository } from '../functions/_shared/repository.ts';
import {
  createPaidOrderFixture,
  createPendingOrderFixture,
  fakePaymentId,
  SAMPLE_CART_TOTAL,
  serviceRepo,
} from './helpers/fixtures.ts';
import { createStaff, createUser, query, rpc, sessions, superQuery } from './helpers/db.ts';

const staffRepo = (userId: string) => new StaffRepository(rpc(sessions.user(userId)));

async function orderRow(orderId: string) {
  const { rows } = await superQuery<{ status: string; payment_status: string; paid_at: Date | null }>(
    `select status, payment_status, paid_at from public.orders where id = $1`,
    [orderId],
  );
  return rows[0];
}

describe('payment confirmation', () => {
  it('confirms a pending order once a verified payment is recorded', async () => {
    const { order, providerOrderId } = await createPendingOrderFixture();
    const result = await serviceRepo().confirmPayment({
      providerOrderId,
      providerPaymentId: fakePaymentId(),
      amountPaise: SAMPLE_CART_TOTAL,
      currency: 'INR',
      method: 'card',
      source: 'checkout',
    });
    expect(result).toMatchObject({ result: 'confirmed', status: 'confirmed', payment_status: 'paid' });
    expect(await orderRow(order.order_id)).toMatchObject({ status: 'confirmed', payment_status: 'paid' });

    const history = await superQuery<{ previous_status: string; new_status: string; source: string }>(
      `select previous_status, new_status, source from public.order_status_history where order_id = $1 order by id`,
      [order.order_id],
    );
    expect(history.rows.at(-1)).toEqual({ previous_status: 'payment_pending', new_status: 'confirmed', source: 'payment' });
  });

  it('is idempotent when the same payment is reported repeatedly (checkout + webhook + retries)', async () => {
    const { order, providerOrderId } = await createPendingOrderFixture();
    const paymentId = fakePaymentId();
    const confirm = (source: 'checkout' | 'webhook') =>
      serviceRepo().confirmPayment({
        providerOrderId,
        providerPaymentId: paymentId,
        amountPaise: SAMPLE_CART_TOTAL,
        currency: 'INR',
        method: 'upi',
        source,
      });

    const results = await Promise.all([confirm('checkout'), confirm('webhook'), confirm('webhook'), confirm('checkout')]);
    expect(results.filter((result) => result.result === 'confirmed')).toHaveLength(1);
    expect(results.filter((result) => result.result === 'already_confirmed')).toHaveLength(3);

    const { rows } = await superQuery<{ count: number }>(
      `select count(*)::int as count from public.order_status_history where order_id = $1 and new_status = 'confirmed'`,
      [order.order_id],
    );
    expect(rows[0]?.count).toBe(1);
  });

  it('flags a second, different payment for an already paid order without changing it', async () => {
    const { order, providerOrderId } = await createPaidOrderFixture();
    const result = await serviceRepo().confirmPayment({
      providerOrderId: providerOrderId,
      providerPaymentId: fakePaymentId(),
      amountPaise: SAMPLE_CART_TOTAL,
      currency: 'INR',
      method: 'upi',
      source: 'webhook',
    });
    expect(result.result).toBe('duplicate_payment');
    expect(await orderRow(order.order_id)).toMatchObject({ status: 'confirmed', payment_status: 'paid' });
  });

  it('does not confirm when the paid amount or currency does not match', async () => {
    const { order, providerOrderId } = await createPendingOrderFixture();
    const result = await serviceRepo().confirmPayment({
      providerOrderId,
      providerPaymentId: fakePaymentId(),
      amountPaise: 100,
      currency: 'INR',
      method: 'upi',
      source: 'webhook',
    });
    expect(result.result).toBe('amount_mismatch');
    expect(await orderRow(order.order_id)).toMatchObject({ status: 'payment_pending', payment_status: 'pending' });
  });

  it('ignores payments for unknown provider orders', async () => {
    const result = await serviceRepo().confirmPayment({
      providerOrderId: 'order_UnknownOrder123',
      providerPaymentId: fakePaymentId(),
      amountPaise: 100,
      currency: 'INR',
      method: null,
      source: 'webhook',
    });
    expect(result.result).toBe('unknown_order');
  });

  it('records failed attempts but keeps the order open for a retry', async () => {
    const { order, providerOrderId } = await createPendingOrderFixture();
    await serviceRepo().recordPaymentFailure({
      providerOrderId,
      providerPaymentId: fakePaymentId(),
      errorCode: 'BAD_REQUEST_ERROR',
      errorDescription: 'Card declined',
    });
    expect(await orderRow(order.order_id)).toMatchObject({ status: 'payment_pending', payment_status: 'failed' });

    const retry = await serviceRepo().confirmPayment({
      providerOrderId,
      providerPaymentId: fakePaymentId(),
      amountPaise: SAMPLE_CART_TOTAL,
      currency: 'INR',
      method: 'upi',
      source: 'checkout',
    });
    expect(retry.result).toBe('confirmed');
  });

  it('never lets a late failure event undo a successful payment', async () => {
    const { order, providerOrderId } = await createPaidOrderFixture();
    const result = await serviceRepo().recordPaymentFailure({
      providerOrderId,
      providerPaymentId: fakePaymentId(),
      errorCode: 'X',
      errorDescription: 'late failure',
    });
    expect(result.result).toBe('ignored_already_paid');
    expect(await orderRow(order.order_id)).toMatchObject({ status: 'confirmed', payment_status: 'paid' });
  });

  it('marks payments received after an admin cancelled the order as needing a refund', async () => {
    const { order, providerOrderId } = await createPendingOrderFixture();
    const adminId = await createStaff('admin');
    await staffRepo(adminId).updateOrderStatus({ orderId: order.order_id, status: 'cancelled', note: 'Abandoned' });
    const result = await serviceRepo().confirmPayment({
      providerOrderId,
      providerPaymentId: fakePaymentId(),
      amountPaise: SAMPLE_CART_TOTAL,
      currency: 'INR',
      method: 'upi',
      source: 'webhook',
    });
    expect(result.result).toBe('paid_after_cancellation');
    expect(await orderRow(order.order_id)).toMatchObject({ status: 'cancelled', payment_status: 'paid' });
  });
});

describe('webhook event deduplication', () => {
  it('processes an event id once and reports duplicates', async () => {
    const eventId = `evt_${randomUUID().replace(/-/g, '')}`;
    const repo = serviceRepo();
    expect(await repo.beginWebhookEvent(eventId, 'payment.captured', { a: 1 })).toMatchObject({ should_process: true });
    await repo.finishWebhookEvent(eventId, 'processed', 'ok');
    expect(await repo.beginWebhookEvent(eventId, 'payment.captured', { a: 1 })).toMatchObject({
      should_process: false,
      attempts: 2,
    });
  });

  it('allows a failed event to be retried', async () => {
    const eventId = `evt_${randomUUID().replace(/-/g, '')}`;
    const repo = serviceRepo();
    await repo.beginWebhookEvent(eventId, 'payment.captured', {});
    await repo.finishWebhookEvent(eventId, 'failed', 'boom');
    expect(await repo.beginWebhookEvent(eventId, 'payment.captured', {})).toMatchObject({ should_process: true });
  });
});

describe('staff order status transitions', () => {
  it('moves a paid order through the kitchen workflow and records who did it', async () => {
    const { order } = await createPaidOrderFixture();
    const staffId = await createStaff('staff', 'Counter Staff');
    const repo = staffRepo(staffId);
    for (const status of ['accepted', 'preparing', 'ready', 'completed'] as const) {
      const result = await repo.updateOrderStatus({ orderId: order.order_id, status });
      expect(result).toMatchObject({ result: 'updated', status });
    }
    const { rows } = await superQuery<{ new_status: string; changed_by: string; source: string }>(
      `select new_status, changed_by, source from public.order_status_history
        where order_id = $1 and source = 'staff' order by id`,
      [order.order_id],
    );
    expect(rows.map((row) => row.new_status)).toEqual(['accepted', 'preparing', 'ready', 'completed']);
    expect(rows.every((row) => row.changed_by === staffId)).toBe(true);
  });

  it.each([
    ['confirmed', 'ready'],
    ['confirmed', 'completed'],
    ['confirmed', 'payment_pending'],
  ] as const)('rejects the invalid transition %s → %s', async (_from, to) => {
    const { order } = await createPaidOrderFixture();
    const staffId = await createStaff('staff');
    await expect(staffRepo(staffId).updateOrderStatus({ orderId: order.order_id, status: to })).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });

  it('never lets staff confirm an unpaid order', async () => {
    const { order } = await createPendingOrderFixture();
    const adminId = await createStaff('admin');
    for (const status of ['confirmed', 'accepted', 'preparing'] as const) {
      await expect(staffRepo(adminId).updateOrderStatus({ orderId: order.order_id, status })).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
      });
    }
    expect(await orderRow(order.order_id)).toMatchObject({ status: 'payment_pending', payment_status: 'pending' });
  });

  it('rejects completed → anything (completed orders are final)', async () => {
    const { order } = await createPaidOrderFixture();
    const adminId = await createStaff('admin');
    const repo = staffRepo(adminId);
    await repo.updateOrderStatus({ orderId: order.order_id, status: 'preparing' });
    await repo.updateOrderStatus({ orderId: order.order_id, status: 'ready' });
    await repo.updateOrderStatus({ orderId: order.order_id, status: 'completed' });
    await expect(repo.updateOrderStatus({ orderId: order.order_id, status: 'ready' })).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });

  it('treats a repeated tap as a no-op and detects stale screens', async () => {
    const { order } = await createPaidOrderFixture();
    const tabletA = staffRepo(await createStaff('staff'));
    const tabletB = staffRepo(await createStaff('staff'));
    await tabletA.updateOrderStatus({ orderId: order.order_id, status: 'preparing', expectedStatus: 'confirmed' });
    await expect(
      tabletA.updateOrderStatus({ orderId: order.order_id, status: 'preparing', expectedStatus: 'confirmed' }),
    ).resolves.toMatchObject({ result: 'unchanged' });
    await expect(
      tabletB.updateOrderStatus({ orderId: order.order_id, status: 'accepted', expectedStatus: 'confirmed' }),
    ).rejects.toMatchObject({ code: 'STALE_STATUS', details: 'preparing' });
  });

  it('denies students and anonymous visitors', async () => {
    const { order, userId } = await createPaidOrderFixture();
    await expect(staffRepo(userId).updateOrderStatus({ orderId: order.order_id, status: 'preparing' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      rpc(sessions.anon()).call('staff_update_order_status', { p_order_id: order.order_id, p_new_status: 'preparing' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(rpc(sessions.student(userId)).call('get_dashboard_stats')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('only lets admins cancel, and requires a reason', async () => {
    const { order } = await createPaidOrderFixture();
    const staffId = await createStaff('staff');
    const adminId = await createStaff('admin');
    await expect(
      staffRepo(staffId).updateOrderStatus({ orderId: order.order_id, status: 'cancelled', note: 'Out of stock' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(staffRepo(adminId).updateOrderStatus({ orderId: order.order_id, status: 'cancelled' })).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    });
  });

  it('records a pending refund when an admin cancels a paid order', async () => {
    const { order, paymentId } = await createPaidOrderFixture();
    const adminId = await createStaff('admin');
    const result = await staffRepo(adminId).updateOrderStatus({
      orderId: order.order_id,
      status: 'cancelled',
      note: 'Item ran out',
    });
    expect(result).toMatchObject({
      status: 'cancelled',
      payment_status: 'refund_pending',
      refund: { provider_payment_id: paymentId, amount_paise: SAMPLE_CART_TOTAL },
    });
  });

  it('lets counter staff toggle availability and pause ordering, but nothing else', async () => {
    const staffId = await createStaff('staff');
    const item = '5eed0000-0000-4000-b000-000000000102';
    await rpc(sessions.user(staffId)).call('set_menu_item_availability', { p_item_id: item, p_is_available: false });
    await rpc(sessions.user(staffId)).call('set_menu_item_availability', { p_item_id: item, p_is_available: true });
    const status = await rpc(sessions.user(staffId)).call<{ reason: string }>('set_ordering_paused', {
      p_paused: true,
      p_message: 'Lunch rush',
    });
    expect(status.reason).toBe('paused');
    await rpc(sessions.user(staffId)).call('set_ordering_paused', { p_paused: false });

    const studentId = await createUser();
    await expect(
      rpc(sessions.student(studentId)).call('set_menu_item_availability', { p_item_id: item, p_is_available: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('refunds', () => {
  it('marks the order refunded once Razorpay reports the refund processed', async () => {
    const { order, paymentId } = await createPaidOrderFixture();
    const adminId = await createStaff('admin');
    const cancel = await staffRepo(adminId).updateOrderStatus({ orderId: order.order_id, status: 'cancelled', note: 'Kitchen closed' });
    const refundId = cancel.refund?.refund_id;
    expect(refundId).toBeDefined();

    const providerRefundId = `rfnd_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const repo = serviceRepo();
    await repo.recordRefundEvent({
      providerRefundId,
      providerPaymentId: paymentId,
      amountPaise: SAMPLE_CART_TOTAL,
      status: 'pending',
      internalRefundId: refundId,
    });
    expect(await orderRow(order.order_id)).toMatchObject({ payment_status: 'refund_pending' });

    // Duplicate "processed" events must not double count.
    for (let i = 0; i < 2; i++) {
      await repo.recordRefundEvent({ providerRefundId, providerPaymentId: paymentId, amountPaise: SAMPLE_CART_TOTAL, status: 'processed' });
    }
    expect(await orderRow(order.order_id)).toMatchObject({ status: 'cancelled', payment_status: 'refunded' });
    const { rows } = await superQuery<{ amount_refunded_paise: number; status: string }>(
      `select amount_refunded_paise, status from public.payments where order_id = $1`,
      [order.order_id],
    );
    expect(rows[0]).toEqual({ amount_refunded_paise: SAMPLE_CART_TOTAL, status: 'refunded' });
  });

  it('cancels an in-progress order when it is fully refunded from the Razorpay dashboard', async () => {
    const { order, paymentId } = await createPaidOrderFixture();
    await serviceRepo().recordRefundEvent({
      providerRefundId: `rfnd_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      providerPaymentId: paymentId,
      amountPaise: SAMPLE_CART_TOTAL,
      status: 'processed',
    });
    expect(await orderRow(order.order_id)).toMatchObject({ status: 'cancelled', payment_status: 'refunded' });
  });

  it('guards against concurrent refund submissions', async () => {
    const { order } = await createPaidOrderFixture();
    const adminId = await createStaff('admin');
    await staffRepo(adminId).updateOrderStatus({ orderId: order.order_id, status: 'cancelled', note: 'Duplicate order' });
    await expect(staffRepo(adminId).prepareRefund(order.order_id)).rejects.toMatchObject({ code: 'REFUND_IN_PROGRESS' });
  });
});

describe('dashboard statistics', () => {
  it('counts only verified payments as revenue and subtracts processed refunds', async () => {
    const adminId = await createStaff('admin');
    const before = await rpc(sessions.user(adminId)).call<{ gross_revenue_paise: number; net_revenue_paise: number; refunded_paise: number }>('get_dashboard_stats');

    await createPendingOrderFixture(); // unpaid: must not count
    const paid = await createPaidOrderFixture();
    await createPaidOrderFixture();
    await serviceRepo().recordRefundEvent({
      providerRefundId: `rfnd_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      providerPaymentId: paid.paymentId,
      amountPaise: SAMPLE_CART_TOTAL,
      status: 'processed',
    });

    const after = await rpc(sessions.user(adminId)).call<{ gross_revenue_paise: number; net_revenue_paise: number; refunded_paise: number }>('get_dashboard_stats');
    expect(after.gross_revenue_paise - before.gross_revenue_paise).toBe(2 * SAMPLE_CART_TOTAL);
    expect(after.refunded_paise - before.refunded_paise).toBe(SAMPLE_CART_TOTAL);
    expect(after.net_revenue_paise - before.net_revenue_paise).toBe(SAMPLE_CART_TOTAL);
  });

  it('keeps unpaid orders out of the kitchen queue', async () => {
    const pending = await createPendingOrderFixture();
    const staffId = await createStaff('staff');
    const { rows } = await query<{ id: string }>(
      sessions.user(staffId),
      `select id from public.orders where status in ('confirmed','accepted','preparing','ready') and id = $1`,
      [pending.order.order_id],
    );
    expect(rows).toEqual([]);
  });
});

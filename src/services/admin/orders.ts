import { ACTIVE_KITCHEN_STATUSES } from '@/lib/order-status';
import { fromPostgrestError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/client';
import type { Tables } from '@/lib/supabase/database.types';
import { invokeFunction } from '@/lib/supabase/functions';
import type { OrderStatus, PaymentStatus } from '@/types/domain';

import type { AdminHistoryEntry, AdminOrder, AdminOrderDetail, AdminRefund } from './types';

const ORDER_SELECT = `
  id, order_number, status, payment_status, customer_name, student_identifier, total_paise, item_count,
  created_at, paid_at, accepted_at, preparing_at, ready_at, completed_at, cancelled_at, cancellation_reason,
  order_items ( id, line_number, item_name, quantity, unit_price_paise, line_total_paise, is_vegetarian, customizations, special_instructions ),
  payments ( provider, provider_order_id, provider_payment_id, status, method, amount_paise, amount_refunded_paise, verified_at, verification_source, failure_reason )
` as const;

type OrderRow = Pick<
  Tables<'orders'>,
  | 'id'
  | 'order_number'
  | 'status'
  | 'payment_status'
  | 'customer_name'
  | 'student_identifier'
  | 'total_paise'
  | 'item_count'
  | 'created_at'
  | 'paid_at'
  | 'accepted_at'
  | 'preparing_at'
  | 'ready_at'
  | 'completed_at'
  | 'cancelled_at'
  | 'cancellation_reason'
> & {
  order_items: Pick<
    Tables<'order_items'>,
    | 'id'
    | 'line_number'
    | 'item_name'
    | 'quantity'
    | 'unit_price_paise'
    | 'line_total_paise'
    | 'is_vegetarian'
    | 'customizations'
    | 'special_instructions'
  >[];
  payments:
    | Pick<
        Tables<'payments'>,
        | 'provider'
        | 'provider_order_id'
        | 'provider_payment_id'
        | 'status'
        | 'method'
        | 'amount_paise'
        | 'amount_refunded_paise'
        | 'verified_at'
        | 'verification_source'
        | 'failure_reason'
      >
    | Pick<Tables<'payments'>, 'provider'>[]
    | null;
};

function mapCustomizations(value: unknown): { name: string; priceDeltaPaise: number }[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return { name: String(record.name ?? ''), priceDeltaPaise: Number(record.price_delta_paise ?? 0) };
  });
}

export function mapAdminOrder(row: OrderRow): AdminOrder {
  const payment = Array.isArray(row.payments) ? row.payments[0] : row.payments;
  const full = payment as Partial<Tables<'payments'>> | undefined | null;
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    customerName: row.customer_name,
    studentIdentifier: row.student_identifier,
    totalPaise: row.total_paise,
    itemCount: row.item_count,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    acceptedAt: row.accepted_at,
    preparingAt: row.preparing_at,
    readyAt: row.ready_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    items: [...(row.order_items ?? [])]
      .sort((a, b) => a.line_number - b.line_number)
      .map((item) => ({
        id: item.id,
        lineNumber: item.line_number,
        name: item.item_name,
        quantity: item.quantity,
        unitPricePaise: item.unit_price_paise,
        lineTotalPaise: item.line_total_paise,
        isVegetarian: item.is_vegetarian,
        customizations: mapCustomizations(item.customizations),
        note: item.special_instructions,
      })),
    payment: full?.provider_order_id
      ? {
          provider: full.provider ?? 'razorpay',
          providerOrderId: full.provider_order_id,
          providerPaymentId: full.provider_payment_id ?? null,
          status: full.status ?? 'created',
          method: full.method ?? null,
          amountPaise: full.amount_paise ?? 0,
          amountRefundedPaise: full.amount_refunded_paise ?? 0,
          verifiedAt: full.verified_at ?? null,
          verificationSource: full.verification_source ?? null,
          failureReason: full.failure_reason ?? null,
        }
      : null,
  };
}

/**
 * The kitchen queue: paid orders only. The database guarantees that kitchen
 * statuses imply a verified payment; the explicit payment filter is a second
 * line of defence so an unpaid order can never be displayed here.
 */
export async function fetchQueue(sinceIso: string): Promise<AdminOrder[]> {
  const client = getAdminSupabase();
  const [active, completed] = await Promise.all([
    client
      .from('orders')
      .select(ORDER_SELECT)
      .in('status', [...ACTIVE_KITCHEN_STATUSES])
      .in('payment_status', ['paid', 'partially_refunded'])
      .order('paid_at', { ascending: true })
      .limit(200),
    client
      .from('orders')
      .select(ORDER_SELECT)
      .eq('status', 'completed')
      .gte('completed_at', sinceIso)
      .order('completed_at', { ascending: false })
      .limit(30),
  ]);
  if (active.error) throw fromPostgrestError(active.error);
  if (completed.error) throw fromPostgrestError(completed.error);
  return [...active.data, ...completed.data].map((row) => mapAdminOrder(row as unknown as OrderRow));
}

export interface OrderFilters {
  search: string;
  status: OrderStatus | 'all';
  paymentStatus: PaymentStatus | 'all';
  from: string | null; // ISO timestamp (inclusive)
  to: string | null; // ISO timestamp (exclusive)
  page: number;
  pageSize: number;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function fetchOrders(filters: OrderFilters): Promise<{ rows: AdminOrder[]; total: number }> {
  let query = getAdminSupabase()
    .from('orders')
    .select(ORDER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(filters.page * filters.pageSize, filters.page * filters.pageSize + filters.pageSize - 1);

  const search = filters.search.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (search) query = query.ilike('order_number', `%${escapeLike(search)}%`);
  if (filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.paymentStatus !== 'all') query = query.eq('payment_status', filters.paymentStatus);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lt('created_at', filters.to);

  const { data, error, count } = await query;
  if (error) throw fromPostgrestError(error);
  return { rows: data.map((row) => mapAdminOrder(row as unknown as OrderRow)), total: count ?? 0 };
}

export async function fetchOrderDetail(orderId: string): Promise<AdminOrderDetail | null> {
  const client = getAdminSupabase();
  const { data, error } = await client
    .from('orders')
    .select(
      `${ORDER_SELECT},
       refunds ( id, provider_refund_id, amount_paise, status, reason, failure_reason, created_at, processed_at, initiator:profiles ( display_name ) ),
       order_status_history ( id, previous_status, new_status, source, note, created_at, actor:profiles ( display_name ) )`,
    )
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) return null;

  const row = data as unknown as OrderRow & {
    refunds: (Pick<
      Tables<'refunds'>,
      'id' | 'provider_refund_id' | 'amount_paise' | 'status' | 'reason' | 'failure_reason' | 'created_at' | 'processed_at'
    > & { initiator: { display_name: string | null } | null })[];
    order_status_history: (Pick<
      Tables<'order_status_history'>,
      'id' | 'previous_status' | 'new_status' | 'source' | 'note' | 'created_at'
    > & { actor: { display_name: string | null } | null })[];
  };

  const refunds: AdminRefund[] = (row.refunds ?? [])
    .map((refund) => ({
      id: refund.id,
      providerRefundId: refund.provider_refund_id,
      amountPaise: refund.amount_paise,
      status: refund.status,
      reason: refund.reason,
      failureReason: refund.failure_reason,
      initiatedBy: refund.initiator?.display_name ?? null,
      createdAt: refund.created_at,
      processedAt: refund.processed_at,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const history: AdminHistoryEntry[] = (row.order_status_history ?? [])
    .map((entry) => ({
      id: entry.id,
      previousStatus: entry.previous_status,
      newStatus: entry.new_status,
      source: entry.source,
      note: entry.note,
      actor: entry.actor?.display_name ?? null,
      createdAt: entry.created_at,
    }))
    .sort((a, b) => a.id - b.id);

  return { ...mapAdminOrder(row), refunds, history };
}

export async function fetchAttentionOrders(): Promise<AdminOrder[]> {
  const { data, error } = await getAdminSupabase()
    .from('orders')
    .select(ORDER_SELECT)
    .or('payment_status.eq.refund_pending,and(status.eq.cancelled,payment_status.eq.paid)')
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) throw fromPostgrestError(error);
  return data.map((row) => mapAdminOrder(row as unknown as OrderRow));
}

export interface StatusUpdateResult {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  changed: boolean;
  refund:
    | { state: 'submitted' | 'processed'; providerRefundId: string; amountPaise: number }
    | { state: 'failed' | 'not_configured'; message: string; amountPaise: number }
    | null;
}

/**
 * Kitchen progress (accept → preparing → ready → completed) goes straight to
 * the database function, which checks the caller's role and the transition.
 * Cancellations go through the update-order-status Edge Function because a
 * cancelled paid order needs a refund submitted with the server-side secret.
 */
export async function updateOrderStatus(input: {
  orderId: string;
  status: OrderStatus;
  expectedStatus: OrderStatus;
  note?: string;
}): Promise<StatusUpdateResult> {
  const client = getAdminSupabase();
  if (input.status === 'cancelled') {
    const { data } = await invokeFunction<{
      order: { status: OrderStatus; paymentStatus: PaymentStatus; changed: boolean };
      refund: StatusUpdateResult['refund'];
    }>(client, 'update-order-status', {
      body: {
        action: 'set_status',
        orderId: input.orderId,
        status: input.status,
        expectedStatus: input.expectedStatus,
        note: input.note,
      },
    });
    return { ...data.order, refund: data.refund };
  }

  const { data, error } = await client.rpc('staff_update_order_status', {
    p_order_id: input.orderId,
    p_new_status: input.status,
    p_expected_status: input.expectedStatus,
    p_note: input.note ?? null,
  });
  if (error) throw fromPostgrestError(error);
  const result = data as unknown as { result: string; status: OrderStatus; payment_status: PaymentStatus };
  return { status: result.status, paymentStatus: result.payment_status, changed: result.result === 'updated', refund: null };
}

export async function requestRefund(orderId: string): Promise<StatusUpdateResult['refund']> {
  const { data } = await invokeFunction<{ refund: StatusUpdateResult['refund'] }>(
    getAdminSupabase(),
    'update-order-status',
    { body: { action: 'refund', orderId } },
  );
  return data.refund;
}

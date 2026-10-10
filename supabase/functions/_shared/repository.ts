/**
 * Typed wrappers around the SQL functions in supabase/migrations. All business
 * rules (pricing, idempotency, status transitions, payment consistency) live
 * in the database; these classes only adapt names and types.
 */
import type { RpcClient } from './rpc.ts';

export type OrderStatus =
  'payment_pending' | 'confirmed' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export type PaymentStatus =
  'pending' | 'paid' | 'failed' | 'refund_pending' | 'partially_refunded' | 'refunded';

export interface CartLineInput {
  menuItemId: string;
  quantity: number;
  optionIds: string[];
  note?: string | undefined;
}

export interface PendingOrder {
  order_id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_paise: number;
  currency: 'INR';
  payment_expires_at: string;
  replayed: boolean;
  provider_order_id: string | null;
  /** Present on prepare_order_payment results: whether payment can proceed. */
  ready?: boolean;
}

export interface PaymentContext {
  order_id: string;
  user_id: string | null;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_paise: number;
  currency: 'INR';
  payment_expires_at: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  payment_record_status: 'created' | 'captured' | 'failed' | 'partially_refunded' | 'refunded' | null;
}

export type ConfirmResult =
  | 'confirmed'
  | 'already_confirmed'
  | 'duplicate_payment'
  | 'paid_after_cancellation'
  | 'amount_mismatch'
  | 'unknown_order';

export interface ConfirmPaymentResult {
  result: ConfirmResult;
  order_id?: string;
  order_number?: string;
  status?: OrderStatus;
  payment_status?: PaymentStatus;
}

export interface RefundRequest {
  refund_id: string;
  provider_payment_id: string;
  amount_paise: number;
}

export interface StatusUpdateResult {
  result: 'updated' | 'unchanged';
  order_id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  refund: RefundRequest | null;
}

/** Service-role operations (Edge Functions only). */
export class OrdersRepository {
  constructor(private readonly rpc: RpcClient) {}

  createPendingOrder(input: {
    userId: string;
    idempotencyKey: string;
    items: CartLineInput[];
    customerName: string;
    studentIdentifier: string | null;
    termsAccepted: boolean;
    accessTokenHash: string | null;
  }): Promise<PendingOrder> {
    return this.rpc.call<PendingOrder>('create_pending_order', {
      p_user_id: input.userId,
      p_idempotency_key: input.idempotencyKey,
      p_items: input.items.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        option_ids: item.optionIds,
        note: item.note ?? null,
      })),
      p_customer_name: input.customerName,
      p_student_identifier: input.studentIdentifier,
      p_terms_accepted: input.termsAccepted,
      p_access_token_hash: input.accessTokenHash,
    });
  }

  prepareOrderPayment(orderId: string, userId: string): Promise<PendingOrder> {
    return this.rpc.call<PendingOrder>('prepare_order_payment', { p_order_id: orderId, p_user_id: userId });
  }

  attachProviderOrder(
    orderId: string,
    providerOrderId: string,
    amountPaise: number,
  ): Promise<{ provider_order_id: string; amount_paise: number; currency: 'INR' }> {
    return this.rpc.call('attach_provider_order', {
      p_order_id: orderId,
      p_provider_order_id: providerOrderId,
      p_amount_paise: amountPaise,
    });
  }

  getPaymentContext(
    lookup: { orderId: string } | { providerOrderId: string },
  ): Promise<PaymentContext | null> {
    return this.rpc.call<PaymentContext | null>('get_payment_context', {
      p_order_id: 'orderId' in lookup ? lookup.orderId : null,
      p_provider_order_id: 'providerOrderId' in lookup ? lookup.providerOrderId : null,
    });
  }

  confirmPayment(input: {
    providerOrderId: string;
    providerPaymentId: string;
    amountPaise: number;
    currency: string;
    method: string | null;
    source: 'checkout' | 'webhook';
  }): Promise<ConfirmPaymentResult> {
    return this.rpc.call<ConfirmPaymentResult>('confirm_order_payment', {
      p_provider_order_id: input.providerOrderId,
      p_provider_payment_id: input.providerPaymentId,
      p_amount_paise: input.amountPaise,
      p_currency: input.currency,
      p_method: input.method,
      p_source: input.source,
    });
  }

  recordPaymentFailure(input: {
    providerOrderId: string;
    providerPaymentId: string | null;
    errorCode: string | null;
    errorDescription: string | null;
  }): Promise<{ result: string }> {
    return this.rpc.call('record_payment_failure', {
      p_provider_order_id: input.providerOrderId,
      p_provider_payment_id: input.providerPaymentId,
      p_error_code: input.errorCode,
      p_error_description: input.errorDescription,
    });
  }

  beginWebhookEvent(
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<{ should_process: boolean; status: string; attempts: number }> {
    return this.rpc.call('begin_webhook_event', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_payload: payload,
    });
  }

  async finishWebhookEvent(eventId: string, status: 'processed' | 'ignored' | 'failed', note: string | null) {
    await this.rpc.call('finish_webhook_event', { p_event_id: eventId, p_status: status, p_note: note });
  }

  recordRefundEvent(input: {
    providerRefundId: string;
    providerPaymentId: string;
    amountPaise: number;
    status: 'pending' | 'processed' | 'failed';
    internalRefundId?: string | null;
    failureReason?: string | null;
  }): Promise<{ result: string; refund_id?: string; amount_refunded_paise?: number }> {
    return this.rpc.call('record_refund_event', {
      p_provider_refund_id: input.providerRefundId,
      p_provider_payment_id: input.providerPaymentId,
      p_amount_paise: input.amountPaise,
      p_status: input.status,
      p_internal_refund_id: input.internalRefundId ?? null,
      p_failure_reason: input.failureReason ?? null,
    });
  }

  async markRefundFailed(refundId: string, reason: string): Promise<void> {
    await this.rpc.call('mark_refund_failed', { p_refund_id: refundId, p_reason: reason });
  }

  checkRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
    return this.rpc.call<boolean>('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
  }
}

/**
 * Operations performed *as the signed-in staff member* (their JWT is passed
 * through), so the database checks their role from public.user_roles.
 */
export class StaffRepository {
  constructor(private readonly rpc: RpcClient) {}

  updateOrderStatus(input: {
    orderId: string;
    status: OrderStatus;
    expectedStatus?: OrderStatus | undefined;
    note?: string | undefined;
  }): Promise<StatusUpdateResult> {
    return this.rpc.call<StatusUpdateResult>('staff_update_order_status', {
      p_order_id: input.orderId,
      p_new_status: input.status,
      p_expected_status: input.expectedStatus ?? null,
      p_note: input.note ?? null,
    });
  }

  prepareRefund(orderId: string): Promise<RefundRequest> {
    return this.rpc.call<RefundRequest>('admin_prepare_refund', { p_order_id: orderId });
  }
}

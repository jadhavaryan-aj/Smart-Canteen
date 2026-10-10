import { toRequestLines, type CartLine } from '@/lib/cart/cart';
import { fromPostgrestError } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase/client';
import { invokeFunction } from '@/lib/supabase/functions';
import type { Json } from '@/lib/supabase/database.types';
import type { CartQuote, OrderStatus, PaymentStatus } from '@/types/domain';

import { mapQuote } from './mappers';
import { ensureStudentSession } from './student-session';

/** Asks the database to price the cart (read-only). Prices come from the DB, never the browser. */
export async function quoteCart(lines: readonly CartLine[]): Promise<CartQuote> {
  const items = toRequestLines(lines).map((line) => ({
    menu_item_id: line.menuItemId,
    quantity: line.quantity,
    option_ids: line.optionIds,
    note: line.note ?? null,
  }));
  const { data, error } = await getSupabase().rpc('quote_cart', { p_items: items as unknown as Json });
  if (error) throw fromPostgrestError(error);
  return mapQuote(data);
}

export interface PaymentConfigStatus {
  configured: boolean;
  mode: 'test' | 'live' | null;
  keyId: string | null;
}

export async function fetchPaymentConfig(): Promise<PaymentConfigStatus> {
  const { data } = await invokeFunction<PaymentConfigStatus>(getSupabase(), 'create-payment-order', { method: 'GET' });
  return data;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalPaise: number;
  currency: 'INR';
  paymentExpiresAt: string;
}

export type PaymentOrderResponse =
  | {
      state: 'awaiting_payment';
      order: OrderSummary;
      payment: {
        provider: 'razorpay';
        keyId: string;
        mode: 'test' | 'live';
        providerOrderId: string;
        amountPaise: number;
        currency: 'INR';
      };
      accessToken: string | null;
      replayed: boolean;
    }
  | { state: 'already_processed'; order: OrderSummary; accessToken: string | null; replayed: true };

export async function createPaymentOrder(input: {
  idempotencyKey: string;
  lines: readonly CartLine[];
  customerName: string;
  studentIdentifier?: string;
}): Promise<PaymentOrderResponse> {
  await ensureStudentSession();
  const customer: { name: string; studentIdentifier?: string } = { name: input.customerName.trim() };
  if (input.studentIdentifier?.trim()) customer.studentIdentifier = input.studentIdentifier.trim();
  const { data } = await invokeFunction<PaymentOrderResponse>(getSupabase(), 'create-payment-order', {
    body: {
      action: 'create',
      idempotencyKey: input.idempotencyKey,
      items: toRequestLines(input.lines),
      customer,
      acceptTerms: true,
    },
  });
  return data;
}

export async function resumePayment(orderId: string): Promise<PaymentOrderResponse> {
  await ensureStudentSession();
  const { data } = await invokeFunction<PaymentOrderResponse>(getSupabase(), 'create-payment-order', {
    body: { action: 'resume', orderId },
  });
  return data;
}

export type VerifyPaymentResponse = {
  state: 'confirmed' | 'pending_confirmation' | 'failed' | 'paid_after_cancellation' | 'duplicate_payment';
  message?: string;
  order: { id: string; orderNumber: string; status: OrderStatus; paymentStatus: PaymentStatus };
};

export async function verifyPayment(input: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<VerifyPaymentResponse> {
  const { data } = await invokeFunction<VerifyPaymentResponse>(getSupabase(), 'verify-payment', { body: input });
  return data;
}

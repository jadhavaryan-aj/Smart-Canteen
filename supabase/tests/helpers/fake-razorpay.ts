/**
 * In-memory stand-in for the Razorpay API used by handler tests. It never
 * talks to Razorpay, so automated tests can never create real charges.
 */
import { randomUUID } from 'node:crypto';

import { hmacSha256Hex } from '../../functions/_shared/crypto.ts';
import {
  RazorpayApiError,
  type RazorpayApi,
  type RazorpayOrder,
  type RazorpayPayment,
  type RazorpayRefund,
} from '../../functions/_shared/razorpay.ts';

export const TEST_KEY_ID = 'rzp_test_FakeKey123';
export const TEST_KEY_SECRET = 'test_secret_for_automated_tests_only';
export const TEST_WEBHOOK_SECRET = 'test_webhook_secret_for_automated_tests_only';

const shortId = () => randomUUID().replace(/-/g, '').slice(0, 14);

export class FakeRazorpay implements RazorpayApi {
  orders = new Map<string, RazorpayOrder>();
  payments = new Map<string, RazorpayPayment>();
  refunds = new Map<string, RazorpayRefund>();
  calls: string[] = [];
  unreachable = false;
  failRefunds = false;

  private guard(call: string) {
    this.calls.push(call);
    if (this.unreachable) throw new TypeError('fetch failed');
  }

  async createOrder(input: { amount: number; currency: 'INR'; receipt: string }): Promise<RazorpayOrder> {
    this.guard('createOrder');
    const order = {
      id: `order_${shortId()}`,
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      status: 'created',
    };
    this.orders.set(order.id, order);
    return order;
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    this.guard('fetchPayment');
    const payment = this.payments.get(paymentId);
    if (!payment) throw new RazorpayApiError(400, 'BAD_REQUEST_ERROR', 'The id provided does not exist');
    return { ...payment };
  }

  async capturePayment(paymentId: string, amount: number): Promise<RazorpayPayment> {
    this.guard('capturePayment');
    const payment = this.payments.get(paymentId);
    if (!payment) throw new RazorpayApiError(400, 'BAD_REQUEST_ERROR', 'The id provided does not exist');
    if (payment.status === 'captured') {
      throw new RazorpayApiError(400, 'BAD_REQUEST_ERROR', 'This payment has already been captured');
    }
    if (payment.amount !== amount)
      throw new RazorpayApiError(400, 'BAD_REQUEST_ERROR', 'Capture amount mismatch');
    payment.status = 'captured';
    payment.captured = true;
    return { ...payment };
  }

  async createRefund(
    paymentId: string,
    input: { amount: number; notes: Record<string, string> },
  ): Promise<RazorpayRefund> {
    this.guard('createRefund');
    if (this.failRefunds) throw new RazorpayApiError(400, 'BAD_REQUEST_ERROR', 'Refund not allowed in test');
    const refund: RazorpayRefund = {
      id: `rfnd_${shortId()}`,
      payment_id: paymentId,
      amount: input.amount,
      status: 'pending',
      notes: input.notes,
    };
    this.refunds.set(refund.id, refund);
    return { ...refund };
  }

  /** Simulates a student completing Razorpay Checkout; returns the callback payload. */
  async simulateCheckout(
    providerOrderId: string,
    options: { status?: RazorpayPayment['status']; amount?: number; method?: string } = {},
  ) {
    const order = this.orders.get(providerOrderId);
    const payment: RazorpayPayment = {
      id: `pay_${shortId()}`,
      order_id: providerOrderId,
      amount: options.amount ?? order?.amount ?? 0,
      currency: 'INR',
      status: options.status ?? 'captured',
      method: options.method ?? 'upi',
      captured: (options.status ?? 'captured') === 'captured',
      error_code: options.status === 'failed' ? 'BAD_REQUEST_ERROR' : null,
      error_description: options.status === 'failed' ? 'Payment failed in test' : null,
    };
    this.payments.set(payment.id, payment);
    const signature = await hmacSha256Hex(TEST_KEY_SECRET, `${providerOrderId}|${payment.id}`);
    return { payment, signature };
  }
}

export async function signWebhook(body: string, secret = TEST_WEBHOOK_SECRET) {
  return hmacSha256Hex(secret, body);
}

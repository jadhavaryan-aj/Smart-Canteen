/**
 * razorpay-webhook
 *
 * The authoritative, server-to-server payment confirmation. Every delivery is
 * authenticated with the webhook secret (HMAC of the raw body), deduplicated
 * by Razorpay's event id, and processed idempotently. Unprocessable events
 * return 5xx so Razorpay retries them; invalid signatures are rejected.
 *
 * Subscribe to: payment.authorized, payment.captured, payment.failed,
 * order.paid, refund.created, refund.processed, refund.failed.
 */
import type { PaymentConfig } from '../_shared/config.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { HttpError, errorResponse, json, readTextBody } from '../_shared/http.ts';
import { logInfo, logWarn } from '../_shared/log.ts';
import {
  sanitizeWebhookPayload,
  verifyWebhookSignature,
  type RazorpayApi,
  type RazorpayPayment,
  type RazorpayRefund,
} from '../_shared/razorpay.ts';
import type { OrdersRepository } from '../_shared/repository.ts';

export interface RazorpayWebhookDeps {
  config: PaymentConfig;
  repo: OrdersRepository;
  razorpay: RazorpayApi | null;
}

interface WebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPayment };
    refund?: { entity?: RazorpayRefund };
  };
}

type Outcome = { status: 'processed' | 'ignored'; note: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function razorpayWebhookHandler(deps: RazorpayWebhookDeps) {
  async function confirmFromPayment(payment: RazorpayPayment): Promise<Outcome> {
    if (!payment.order_id) return { status: 'ignored', note: 'payment without order_id' };
    const result = await deps.repo.confirmPayment({
      providerOrderId: payment.order_id,
      providerPaymentId: payment.id,
      amountPaise: payment.amount,
      currency: payment.currency,
      method: payment.method ?? null,
      source: 'webhook',
    });
    if (result.result === 'duplicate_payment' || result.result === 'amount_mismatch') {
      logWarn('webhook_payment_anomaly', { result: result.result, orderId: result.order_id ?? null });
    }
    return {
      status: result.result === 'unknown_order' ? 'ignored' : 'processed',
      note: `confirm:${result.result}`,
    };
  }

  async function handleEvent(body: WebhookBody): Promise<Outcome> {
    const event = body.event ?? 'unknown';
    const payment = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;

    switch (event) {
      case 'payment.captured':
      case 'order.paid': {
        if (!payment) return { status: 'ignored', note: 'missing payment entity' };
        if (payment.status !== 'captured')
          return { status: 'ignored', note: `payment status ${payment.status}` };
        return confirmFromPayment(payment);
      }

      case 'payment.authorized': {
        // Only relevant when automatic capture is disabled in the Razorpay dashboard.
        if (!payment?.order_id) return { status: 'ignored', note: 'missing payment entity' };
        const context = await deps.repo.getPaymentContext({ providerOrderId: payment.order_id });
        if (!context) return { status: 'ignored', note: 'unknown order' };
        if (context.status !== 'payment_pending')
          return { status: 'ignored', note: 'order not pending; not capturing' };
        if (!deps.razorpay) throw new Error('Razorpay API not configured; cannot capture');
        if (payment.amount !== context.total_paise || payment.currency !== 'INR') {
          return { status: 'ignored', note: 'authorised amount mismatch; not capturing' };
        }
        let captured: RazorpayPayment;
        try {
          captured = await deps.razorpay.capturePayment(payment.id, context.total_paise, 'INR');
        } catch {
          captured = await deps.razorpay.fetchPayment(payment.id);
        }
        if (captured.status !== 'captured') {
          throw new Error(`capture did not complete (status ${captured.status})`);
        }
        return confirmFromPayment(captured);
      }

      case 'payment.failed': {
        if (!payment?.order_id) return { status: 'ignored', note: 'missing payment entity' };
        const result = await deps.repo.recordPaymentFailure({
          providerOrderId: payment.order_id,
          providerPaymentId: payment.id,
          errorCode: payment.error_code ?? null,
          errorDescription: payment.error_description ?? null,
        });
        return {
          status: result.result === 'unknown_order' ? 'ignored' : 'processed',
          note: `failure:${result.result}`,
        };
      }

      case 'refund.created':
      case 'refund.processed':
      case 'refund.failed': {
        if (!refund) return { status: 'ignored', note: 'missing refund entity' };
        const status =
          event === 'refund.processed' ? 'processed' : event === 'refund.failed' ? 'failed' : 'pending';
        const notes = refund.notes && !Array.isArray(refund.notes) ? refund.notes : {};
        const internalRefundId =
          typeof notes.refund_id === 'string' && UUID_RE.test(notes.refund_id) ? notes.refund_id : null;
        const result = await deps.repo.recordRefundEvent({
          providerRefundId: refund.id,
          providerPaymentId: refund.payment_id,
          amountPaise: refund.amount,
          status: refund.status === 'processed' ? 'processed' : status,
          internalRefundId,
          failureReason: status === 'failed' ? 'Refund failed at Razorpay' : null,
        });
        return {
          status: result.result === 'unknown_payment' ? 'ignored' : 'processed',
          note: `refund:${result.result}`,
        };
      }

      default:
        return { status: 'ignored', note: `unhandled event ${event}` };
    }
  }

  return async function handle(request: Request): Promise<Response> {
    const headers: Record<string, string> = {};
    try {
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      if (!deps.config.webhookSecret) {
        // 5xx makes Razorpay retry once the secret has been configured.
        logWarn('webhook_secret_missing');
        throw new HttpError(503, 'WEBHOOK_NOT_CONFIGURED', 'Webhook secret is not configured.');
      }

      const rawBody = await readTextBody(request, 256 * 1024);
      const valid = await verifyWebhookSignature({
        rawBody,
        signature: request.headers.get('x-razorpay-signature'),
        secret: deps.config.webhookSecret,
      });
      if (!valid) {
        logWarn('webhook_signature_invalid');
        throw new HttpError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature.');
      }

      let body: WebhookBody;
      try {
        body = JSON.parse(rawBody) as WebhookBody;
      } catch {
        throw new HttpError(400, 'INVALID_JSON', 'Invalid JSON.');
      }

      const headerEventId = request.headers.get('x-razorpay-event-id');
      const eventId =
        headerEventId && /^[A-Za-z0-9_-]{1,128}$/.test(headerEventId)
          ? headerEventId
          : `sha256:${await sha256Hex(rawBody)}`;
      const eventType = typeof body.event === 'string' ? body.event : 'unknown';

      const registration = await deps.repo.beginWebhookEvent(
        eventId,
        eventType,
        sanitizeWebhookPayload(body),
      );
      if (!registration.should_process) {
        return json({ status: 'duplicate' }, 200, headers);
      }

      try {
        const outcome = await handleEvent(body);
        await deps.repo.finishWebhookEvent(eventId, outcome.status, outcome.note);
        logInfo('webhook_processed', { event: eventType, outcome: outcome.status, note: outcome.note });
        return json({ status: outcome.status }, 200, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await deps.repo.finishWebhookEvent(eventId, 'failed', message.slice(0, 500)).catch(() => undefined);
        logWarn('webhook_processing_failed', { event: eventType });
        throw new HttpError(500, 'PROCESSING_FAILED', 'Event processing failed; it will be retried.');
      }
    } catch (error) {
      return errorResponse(error, headers);
    }
  };
}

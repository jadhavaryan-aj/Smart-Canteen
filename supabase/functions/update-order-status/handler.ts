/**
 * update-order-status
 *
 * POST { action: "set_status", orderId, status, expectedStatus?, note? }
 * POST { action: "refund", orderId }            (admins, for cancelled paid orders)
 *
 * Status changes run *as the calling staff member* (their JWT is forwarded),
 * so the database enforces their role and the allowed transitions. Only when
 * an administrator cancels a paid order does this function use the Razorpay
 * secret, to submit the refund the database has just recorded.
 */
import type { Authenticator } from '../_shared/auth.ts';
import type { PaymentConfig } from '../_shared/config.ts';
import { corsHeaders, preflight } from '../_shared/cors.ts';
import { errorResponse, HttpError, json, readJsonBody } from '../_shared/http.ts';
import { logInfo, logWarn } from '../_shared/log.ts';
import { RazorpayApiError, type RazorpayApi } from '../_shared/razorpay.ts';
import type { OrdersRepository, RefundRequest, StaffRepository } from '../_shared/repository.ts';
import { formatZodError, updateOrderStatusSchema } from '../_shared/validation.ts';

export interface UpdateOrderStatusDeps {
  config: PaymentConfig;
  repo: OrdersRepository;
  razorpay: RazorpayApi | null;
  authenticate: Authenticator;
  /** Repository bound to the caller's own JWT. */
  staffRepoFor: (request: Request) => StaffRepository;
  allowedOrigins: readonly string[];
}

export type RefundOutcome =
  | { state: 'submitted' | 'processed'; providerRefundId: string; amountPaise: number }
  | { state: 'failed' | 'not_configured'; message: string; amountPaise: number };

export function updateOrderStatusHandler(deps: UpdateOrderStatusDeps) {
  async function submitRefund(refund: RefundRequest, orderId: string): Promise<RefundOutcome> {
    if (!deps.config.configured || !deps.razorpay) {
      await deps.repo.markRefundFailed(refund.refund_id, 'Payments are not configured on the server.');
      return {
        state: 'not_configured',
        amountPaise: refund.amount_paise,
        message: 'Razorpay is not configured on the server. Refund this payment from the Razorpay dashboard.',
      };
    }
    try {
      const created = await deps.razorpay.createRefund(refund.provider_payment_id, {
        amount: refund.amount_paise,
        receipt: refund.refund_id,
        notes: { refund_id: refund.refund_id, order_id: orderId },
      });
      await deps.repo.recordRefundEvent({
        providerRefundId: created.id,
        providerPaymentId: refund.provider_payment_id,
        amountPaise: created.amount,
        status: created.status === 'processed' ? 'processed' : created.status === 'failed' ? 'failed' : 'pending',
        internalRefundId: refund.refund_id,
      });
      logInfo('refund_submitted', { orderId, status: created.status });
      return {
        state: created.status === 'processed' ? 'processed' : 'submitted',
        providerRefundId: created.id,
        amountPaise: created.amount,
      };
    } catch (error) {
      const message =
        error instanceof RazorpayApiError && error.description ? error.description : 'Razorpay did not accept the refund.';
      logWarn('refund_failed', { orderId, status: error instanceof RazorpayApiError ? error.status : null });
      await deps.repo.markRefundFailed(refund.refund_id, message);
      return { state: 'failed', amountPaise: refund.amount_paise, message };
    }
  }

  return async function handle(request: Request): Promise<Response> {
    const headers = corsHeaders(request, deps.allowedOrigins);
    if (request.method === 'OPTIONS') return preflight(request, deps.allowedOrigins);

    try {
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');

      const user = await deps.authenticate(request);
      if (!user || user.isAnonymous) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in as staff.');

      const parsed = updateOrderStatusSchema.safeParse(await readJsonBody(request));
      if (!parsed.success) {
        throw new HttpError(400, 'INVALID_REQUEST', 'Invalid status update.', formatZodError(parsed.error));
      }
      const body = parsed.data;

      if (!(await deps.repo.checkRateLimit(`update-order-status:user:${user.id}`, 240, 60))) {
        throw new HttpError(429, 'RATE_LIMITED', 'Too many updates. Please wait a moment.');
      }

      const staff = deps.staffRepoFor(request);

      if (body.action === 'refund') {
        const refund = await staff.prepareRefund(body.orderId);
        const outcome = await submitRefund(refund, body.orderId);
        return json({ order: null, refund: outcome }, 200, headers);
      }

      const result = await staff.updateOrderStatus({
        orderId: body.orderId,
        status: body.status,
        expectedStatus: body.expectedStatus,
        note: body.note,
      });
      const refund = result.refund ? await submitRefund(result.refund, result.order_id) : null;

      return json(
        {
          order: {
            id: result.order_id,
            orderNumber: result.order_number,
            status: result.status,
            paymentStatus: result.payment_status,
            changed: result.result === 'updated',
          },
          refund,
        },
        200,
        headers,
      );
    } catch (error) {
      return errorResponse(error, headers);
    }
  };
}

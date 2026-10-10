/**
 * verify-payment
 *
 * Called by the browser after Razorpay Checkout reports success. The browser's
 * claim is *not* trusted: we verify the HMAC signature with our secret, then
 * fetch the payment from Razorpay's API and check its order, amount, currency
 * and status before recording it. If Razorpay cannot be reached, the order
 * stays pending and the webhook confirms it later.
 */
import type { Authenticator } from '../_shared/auth.ts';
import type { PaymentConfig } from '../_shared/config.ts';
import { corsHeaders, preflight } from '../_shared/cors.ts';
import { errorResponse, HttpError, json, readJsonBody } from '../_shared/http.ts';
import { logInfo, logWarn } from '../_shared/log.ts';
import {
  RazorpayApiError,
  verifyCheckoutSignature,
  type RazorpayApi,
  type RazorpayPayment,
} from '../_shared/razorpay.ts';
import type { ConfirmPaymentResult, OrdersRepository, PaymentContext } from '../_shared/repository.ts';
import { formatZodError, verifyPaymentSchema } from '../_shared/validation.ts';

export interface VerifyPaymentDeps {
  config: PaymentConfig;
  repo: OrdersRepository;
  authenticate: Authenticator;
  razorpay: RazorpayApi | null;
  allowedOrigins: readonly string[];
  limits?: { perUser: number; windowSeconds: number };
}

const DEFAULT_LIMITS = { perUser: 30, windowSeconds: 600 };

type Headers = Record<string, string>;

function orderSummary(context: PaymentContext, result?: ConfirmPaymentResult) {
  return {
    id: context.order_id,
    orderNumber: context.order_number,
    status: result?.status ?? context.status,
    paymentStatus: result?.payment_status ?? context.payment_status,
  };
}

function pendingResponse(context: PaymentContext, headers: Headers, reason: string): Response {
  return json(
    {
      state: 'pending_confirmation',
      message: 'We are confirming your payment with the bank. This page will update automatically.',
      reason,
      order: orderSummary(context),
    },
    202,
    headers,
  );
}

export function verifyPaymentHandler(deps: VerifyPaymentDeps) {
  const limits = deps.limits ?? DEFAULT_LIMITS;

  return async function handle(request: Request): Promise<Response> {
    const headers = corsHeaders(request, deps.allowedOrigins);
    if (request.method === 'OPTIONS') return preflight(request, deps.allowedOrigins);

    try {
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      if (!deps.config.configured || !deps.config.keySecret || !deps.razorpay) {
        throw new HttpError(503, 'PAYMENTS_NOT_CONFIGURED', 'Online payments are not configured yet.');
      }

      const user = await deps.authenticate(request);
      if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please refresh the page and try again.');

      const parsed = verifyPaymentSchema.safeParse(await readJsonBody(request));
      if (!parsed.success) {
        throw new HttpError(400, 'INVALID_REQUEST', 'Invalid payment confirmation.', formatZodError(parsed.error));
      }
      const body = parsed.data;

      if (!(await deps.repo.checkRateLimit(`verify-payment:user:${user.id}`, limits.perUser, limits.windowSeconds))) {
        throw new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a moment.');
      }

      const context = await deps.repo.getPaymentContext({ orderId: body.orderId });
      // Not found and not yours look identical, so order ids cannot be probed.
      if (!context || context.user_id !== user.id) {
        throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      if (!context.provider_order_id || context.provider_order_id !== body.razorpayOrderId) {
        throw new HttpError(400, 'PAYMENT_MISMATCH', 'This payment does not belong to this order.');
      }

      const signatureValid = await verifyCheckoutSignature({
        orderId: context.provider_order_id,
        paymentId: body.razorpayPaymentId,
        signature: body.razorpaySignature,
        secret: deps.config.keySecret,
      });
      if (!signatureValid) {
        logWarn('payment_signature_invalid', { orderId: context.order_id });
        throw new HttpError(400, 'INVALID_SIGNATURE', 'We could not verify this payment.');
      }

      // Fast path: this exact payment was already recorded (e.g. by the webhook).
      if (
        context.provider_payment_id === body.razorpayPaymentId &&
        context.payment_record_status !== null &&
        ['captured', 'partially_refunded', 'refunded'].includes(context.payment_record_status)
      ) {
        return json({ state: 'confirmed', order: orderSummary(context) }, 200, headers);
      }

      let payment: RazorpayPayment;
      try {
        payment = await deps.razorpay.fetchPayment(body.razorpayPaymentId);
      } catch (error) {
        logWarn('razorpay_fetch_payment_failed', {
          orderId: context.order_id,
          status: error instanceof RazorpayApiError ? error.status : null,
        });
        return pendingResponse(context, headers, 'provider_unreachable');
      }

      if (payment.order_id !== context.provider_order_id) {
        logWarn('payment_order_mismatch', { orderId: context.order_id });
        throw new HttpError(400, 'PAYMENT_MISMATCH', 'This payment does not belong to this order.');
      }

      if (payment.status === 'failed') {
        await deps.repo.recordPaymentFailure({
          providerOrderId: context.provider_order_id,
          providerPaymentId: payment.id,
          errorCode: payment.error_code ?? null,
          errorDescription: payment.error_description ?? null,
        });
        return json(
          {
            state: 'failed',
            message: payment.error_description || 'The payment did not go through. You have not been charged.',
            order: orderSummary(context),
          },
          200,
          headers,
        );
      }

      if (payment.status === 'authorized') {
        if (context.status !== 'payment_pending') {
          // Do not capture money for an order that can no longer be fulfilled;
          // uncaptured authorisations are released automatically by Razorpay.
          return pendingResponse(context, headers, 'order_not_pending');
        }
        try {
          payment = await deps.razorpay.capturePayment(payment.id, context.total_paise, 'INR');
        } catch (error) {
          logWarn('razorpay_capture_failed', {
            orderId: context.order_id,
            status: error instanceof RazorpayApiError ? error.status : null,
          });
          try {
            payment = await deps.razorpay.fetchPayment(body.razorpayPaymentId);
          } catch {
            return pendingResponse(context, headers, 'capture_unconfirmed');
          }
        }
      }

      if (payment.status !== 'captured') {
        return pendingResponse(context, headers, `provider_status_${payment.status}`);
      }

      const result = await deps.repo.confirmPayment({
        providerOrderId: context.provider_order_id,
        providerPaymentId: payment.id,
        amountPaise: payment.amount,
        currency: payment.currency,
        method: payment.method ?? null,
        source: 'checkout',
      });
      logInfo('payment_verified', { orderId: context.order_id, result: result.result });

      switch (result.result) {
        case 'confirmed':
        case 'already_confirmed':
          return json({ state: 'confirmed', order: orderSummary(context, result) }, 200, headers);
        case 'paid_after_cancellation':
          return json(
            {
              state: 'paid_after_cancellation',
              message: 'Your payment was received after this order was cancelled. The canteen will refund it.',
              order: orderSummary(context, result),
            },
            200,
            headers,
          );
        case 'duplicate_payment':
          logWarn('duplicate_payment_captured', { orderId: context.order_id });
          return json(
            {
              state: 'duplicate_payment',
              message: 'This order was already paid. The extra payment will be refunded by the canteen.',
              order: orderSummary(context, result),
            },
            200,
            headers,
          );
        case 'amount_mismatch':
          logWarn('payment_amount_mismatch', { orderId: context.order_id });
          throw new HttpError(409, 'PAYMENT_AMOUNT_MISMATCH', 'The payment amount did not match this order.');
        default:
          throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
      }
    } catch (error) {
      return errorResponse(error, headers);
    }
  };
}

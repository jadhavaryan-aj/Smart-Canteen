/**
 * create-payment-order
 *
 * GET  → payment configuration status (is Razorpay configured? test or live?)
 * POST { action: "create", idempotencyKey, items, customer, acceptTerms }
 *      → creates a pending order from database prices, then a Razorpay order
 * POST { action: "resume", orderId }
 *      → re-validates an existing pending order and returns its Razorpay order
 *
 * The browser never supplies prices or totals. The pending order is created
 * before payment and only becomes "confirmed" once verify-payment or the
 * webhook has verified a captured payment.
 */
import type { Authenticator } from '../_shared/auth.ts';
import type { PaymentConfig } from '../_shared/config.ts';
import { corsHeaders, preflight } from '../_shared/cors.ts';
import { randomToken, sha256Hex } from '../_shared/crypto.ts';
import { clientIp, errorResponse, HttpError, json, readJsonBody } from '../_shared/http.ts';
import { logInfo, logWarn } from '../_shared/log.ts';
import { RazorpayApiError, type RazorpayApi } from '../_shared/razorpay.ts';
import type { OrdersRepository, PendingOrder } from '../_shared/repository.ts';
import { formatZodError, paymentOrderRequestSchema } from '../_shared/validation.ts';

export interface CreatePaymentOrderDeps {
  config: PaymentConfig;
  repo: OrdersRepository;
  authenticate: Authenticator;
  razorpay: RazorpayApi | null;
  allowedOrigins: readonly string[];
  /** Rate limits per window; overridable in tests. */
  limits?: { perUser: number; perIp: number; windowSeconds: number };
}

const DEFAULT_LIMITS = { perUser: 12, perIp: 120, windowSeconds: 600 };

export function createPaymentOrderHandler(deps: CreatePaymentOrderDeps) {
  const limits = deps.limits ?? DEFAULT_LIMITS;

  return async function handle(request: Request): Promise<Response> {
    const headers = corsHeaders(request, deps.allowedOrigins);
    if (request.method === 'OPTIONS') return preflight(request, deps.allowedOrigins);

    try {
      if (request.method === 'GET') {
        return json(
          {
            configured: deps.config.configured,
            mode: deps.config.configured ? deps.config.mode : null,
            keyId: deps.config.configured ? deps.config.keyId : null,
          },
          200,
          headers,
        );
      }
      if (request.method !== 'POST') {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      }

      if (!deps.config.configured || !deps.razorpay || !deps.config.keyId) {
        logWarn('payments_not_configured', { problem: deps.config.problem });
        throw new HttpError(503, 'PAYMENTS_NOT_CONFIGURED', 'Online payments are not configured yet.');
      }

      const user = await deps.authenticate(request);
      if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please refresh the page and try again.');

      const parsed = paymentOrderRequestSchema.safeParse(await readJsonBody(request));
      if (!parsed.success) {
        throw new HttpError(400, 'INVALID_REQUEST', 'Please check your order details.', formatZodError(parsed.error));
      }

      const withinUserLimit = await deps.repo.checkRateLimit(
        `create-payment-order:user:${user.id}`,
        limits.perUser,
        limits.windowSeconds,
      );
      const ip = clientIp(request);
      const withinIpLimit = ip
        ? await deps.repo.checkRateLimit(`create-payment-order:ip:${ip}`, limits.perIp, limits.windowSeconds)
        : true;
      if (!withinUserLimit || !withinIpLimit) {
        throw new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.');
      }

      const body = parsed.data;
      let order: PendingOrder;
      let accessToken: string | null = null;

      if (body.action === 'create') {
        accessToken = randomToken();
        order = await deps.repo.createPendingOrder({
          userId: user.id,
          idempotencyKey: body.idempotencyKey,
          items: body.items,
          customerName: body.customer.name,
          studentIdentifier: body.customer.studentIdentifier?.trim() || null,
          termsAccepted: body.acceptTerms,
          accessTokenHash: await sha256Hex(accessToken),
        });
        // A replayed submission may be old: re-check expiry, hours and menu.
        if (order.replayed) {
          order = { ...(await deps.repo.prepareOrderPayment(order.order_id, user.id)), replayed: true };
        }
      } else {
        order = await deps.repo.prepareOrderPayment(body.orderId, user.id);
      }

      const orderSummary = {
        id: order.order_id,
        orderNumber: order.order_number,
        status: order.status,
        paymentStatus: order.payment_status,
        totalPaise: order.total_paise,
        currency: order.currency,
        paymentExpiresAt: order.payment_expires_at,
      };

      if (order.status !== 'payment_pending') {
        // Already paid (or cancelled) — never open a second payment.
        return json({ state: 'already_processed', order: orderSummary, accessToken, replayed: true }, 200, headers);
      }

      let providerOrderId = order.provider_order_id;
      if (!providerOrderId) {
        let created;
        try {
          created = await deps.razorpay.createOrder({
            amount: order.total_paise,
            currency: 'INR',
            receipt: order.order_number,
            notes: { order_id: order.order_id, order_number: order.order_number },
          });
        } catch (error) {
          logWarn('razorpay_create_order_failed', {
            orderId: order.order_id,
            status: error instanceof RazorpayApiError ? error.status : null,
            code: error instanceof RazorpayApiError ? error.code : null,
          });
          throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment service is unavailable. Please try again.');
        }
        if (created.amount !== order.total_paise || created.currency !== 'INR') {
          throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment service returned an unexpected amount.');
        }
        const attached = await deps.repo.attachProviderOrder(order.order_id, created.id, order.total_paise);
        providerOrderId = attached.provider_order_id;
      }

      logInfo('payment_order_ready', { orderId: order.order_id, replayed: order.replayed, action: body.action });

      return json(
        {
          state: 'awaiting_payment',
          order: orderSummary,
          payment: {
            provider: 'razorpay',
            keyId: deps.config.keyId,
            mode: deps.config.mode,
            providerOrderId,
            amountPaise: order.total_paise,
            currency: 'INR',
          },
          accessToken,
          replayed: order.replayed,
        },
        200,
        headers,
      );
    } catch (error) {
      return errorResponse(error, headers);
    }
  };
}

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { toRequestLines, type CartLine } from '@/lib/cart/cart';
import { cartStore } from '@/lib/cart/cart-store';
import { AppError, messageFor } from '@/lib/errors';
import { idempotencyKeyFor, rememberCheckoutOrder, resetCheckoutSession } from '@/lib/payments/checkout-session';
import { openRazorpayCheckout } from '@/lib/payments/razorpay-checkout';
import { createPaymentOrder, resumePayment, verifyPayment, type PaymentOrderResponse } from '@/services/checkout';
import { saveReceiptToken } from '@/services/receipt-links';

import { menuQueryKey } from './use-menu';
import { settingsQueryKey } from './use-settings';

export type CheckoutPhase =
  | { name: 'idle' }
  | { name: 'creating' }
  | { name: 'confirm_total'; serverTotalPaise: number; displayedTotalPaise: number }
  | { name: 'paying' }
  | { name: 'verifying' }
  | { name: 'dismissed' }
  | { name: 'error'; code: string; message: string; details?: unknown };

/** Errors after which the current pending order can no longer be paid: start a fresh one next time. */
const ROTATE_KEY_CODES = new Set(['ORDER_EXPIRED', 'MENU_CHANGED', 'IDEMPOTENCY_CONFLICT', 'ITEMS_UNAVAILABLE']);

export function useCheckoutFlow(canteenName: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<CheckoutPhase>({ name: 'idle' });
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const busy = useRef(false);
  const confirmResolver = useRef<((proceed: boolean) => void) | null>(null);

  const resolveTotalConfirmation = useCallback((proceed: boolean) => {
    confirmResolver.current?.(proceed);
    confirmResolver.current = null;
  }, []);

  const runPayment = useCallback(
    async (response: PaymentOrderResponse, customerName: string, displayedTotalPaise: number | null) => {
      if (response.accessToken) saveReceiptToken(response.order.id, response.accessToken);
      rememberCheckoutOrder(response.order.id);

      if (response.state === 'already_processed') {
        cartStore.dispatch({ type: 'clear' });
        resetCheckoutSession();
        navigate(`/orders/${response.order.id}`);
        return;
      }

      if (displayedTotalPaise !== null && response.order.totalPaise !== displayedTotalPaise) {
        setPhase({ name: 'confirm_total', serverTotalPaise: response.order.totalPaise, displayedTotalPaise });
        const proceed = await new Promise<boolean>((resolve) => {
          confirmResolver.current = resolve;
        });
        if (!proceed) {
          setPhase({ name: 'idle' });
          return;
        }
      }

      setAttemptError(null);
      setPhase({ name: 'paying' });
      const outcome = await openRazorpayCheckout({
        keyId: response.payment.keyId,
        providerOrderId: response.payment.providerOrderId,
        amountPaise: response.payment.amountPaise,
        canteenName,
        orderNumber: response.order.orderNumber,
        customerName,
        onAttemptFailed: setAttemptError,
      });

      if (outcome.type === 'dismissed') {
        setPhase({ name: 'dismissed' });
        return;
      }

      setPhase({ name: 'verifying' });
      try {
        const verified = await verifyPayment({
          orderId: response.order.id,
          razorpayOrderId: outcome.response.razorpay_order_id,
          razorpayPaymentId: outcome.response.razorpay_payment_id,
          razorpaySignature: outcome.response.razorpay_signature,
        });
        if (verified.state === 'failed') {
          setPhase({ name: 'error', code: 'PAYMENT_FAILED', message: verified.message ?? 'The payment did not go through.' });
          return;
        }
        if (verified.state === 'confirmed') {
          cartStore.dispatch({ type: 'clear' });
          resetCheckoutSession();
        }
        // Pending confirmations are settled by the webhook; the receipt page keeps checking.
        navigate(`/orders/${response.order.id}`, { state: { fromCheckout: true, verification: verified.state } });
      } catch (error) {
        if (error instanceof AppError && ['INVALID_SIGNATURE', 'PAYMENT_MISMATCH'].includes(error.code)) {
          setPhase({ name: 'error', code: error.code, message: messageFor(error) });
          return;
        }
        // We could not reach our server, but Razorpay reported success: let the receipt page confirm.
        navigate(`/orders/${response.order.id}`, { state: { fromCheckout: true, verification: 'pending_confirmation' } });
      }
    },
    [canteenName, navigate],
  );

  const handleError = useCallback(
    (error: unknown) => {
      const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      if (ROTATE_KEY_CODES.has(code)) resetCheckoutSession();
      if (code === 'ITEMS_UNAVAILABLE' || code === 'MENU_CHANGED') void queryClient.invalidateQueries({ queryKey: menuQueryKey });
      if (code === 'ORDERING_CLOSED') void queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      setPhase({
        name: 'error',
        code,
        message: messageFor(error),
        details: error instanceof AppError ? error.details : undefined,
      });
    },
    [queryClient],
  );

  const startCheckout = useCallback(
    async (input: {
      lines: readonly CartLine[];
      customerName: string;
      studentIdentifier: string;
      displayedTotalPaise: number | null;
    }) => {
      if (busy.current) return; // guard against double submission
      busy.current = true;
      setPhase({ name: 'creating' });
      try {
        const fingerprint = JSON.stringify({
          lines: toRequestLines(input.lines),
          name: input.customerName.trim(),
          studentId: input.studentIdentifier.trim(),
        });
        const response = await createPaymentOrder({
          idempotencyKey: idempotencyKeyFor(fingerprint),
          lines: input.lines,
          customerName: input.customerName,
          studentIdentifier: input.studentIdentifier,
        });
        await runPayment(response, input.customerName, input.displayedTotalPaise);
      } catch (error) {
        handleError(error);
      } finally {
        busy.current = false;
      }
    },
    [handleError, runPayment],
  );

  const resumeCheckout = useCallback(
    async (orderId: string, customerName: string) => {
      if (busy.current) return;
      busy.current = true;
      setPhase({ name: 'creating' });
      try {
        await runPayment(await resumePayment(orderId), customerName, null);
      } catch (error) {
        handleError(error);
      } finally {
        busy.current = false;
      }
    },
    [handleError, runPayment],
  );

  return {
    phase,
    attemptError,
    startCheckout,
    resumeCheckout,
    resolveTotalConfirmation,
    reset: () => setPhase({ name: 'idle' }),
  };
}

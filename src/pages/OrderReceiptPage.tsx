import {
  ArrowLeft,
  Copy,
  FileDown,
  Hourglass,
  LoaderCircle,
  Printer,
  ReceiptText,
  RefreshCw,
  Wifi,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { toast } from 'sonner';

import { PaymentProgress } from '@/components/checkout/payment-progress';
import { OrderStatusBadge } from '@/components/common/status-badge';
import { EmptyState, ErrorState, SetupRequired } from '@/components/common/states';
import { Container } from '@/components/layout/container';
import { ReceiptCard } from '@/components/receipt/receipt-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCheckoutFlow } from '@/hooks/use-checkout-flow';
import { useNow } from '@/hooks/use-now';
import { usePageTitle } from '@/hooks/use-page-title';
import { useReceipt } from '@/hooks/use-receipt';
import { useSettings } from '@/hooks/use-settings';
import { cartStore } from '@/lib/cart/cart-store';
import { formatDateTime } from '@/lib/dates';
import { ORDER_STATUS_META } from '@/lib/order-status';
import { checkoutOrderId, resetCheckoutSession } from '@/lib/payments/checkout-session';
import { supabaseConfig } from '@/lib/supabase/env';
import { getReceiptToken, receiptUrl, saveReceiptToken } from '@/services/receipt-links';

function tokenFromHash(): string | null {
  return /(?:^|&)t=([A-Za-z0-9_-]{32,128})/.exec(window.location.hash.slice(1))?.[1] ?? null;
}

/**
 * Receipt links carry their token in the URL fragment (#t=…), which browsers
 * never send to servers or in Referer headers. The token is saved on this
 * device and then removed from the address bar.
 */
function useAccessToken(orderId: string): string | null {
  const token = tokenFromHash() ?? getReceiptToken(orderId);
  useEffect(() => {
    const fromHash = tokenFromHash();
    if (!fromHash) return;
    saveReceiptToken(orderId, fromHash);
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, [orderId]);
  return token;
}

export default function OrderReceiptPage() {
  const { orderId = '' } = useParams();
  const location = useLocation();
  const fromCheckout = (location.state as { verification?: string } | null)?.verification;
  const token = useAccessToken(orderId);
  const settings = useSettings();
  const receipt = useReceipt(orderId, token);
  const flow = useCheckoutFlow(settings.data?.canteenName ?? 'Campus Table');
  const data = receipt.data;
  const previousStatus = useRef<string | null>(null);
  const now = useNow(15_000);

  usePageTitle(data ? `Order ${data.orderNumber}` : 'Your order');

  // Once payment is confirmed (possibly by the webhook), finish the checkout on this device.
  useEffect(() => {
    if (data && data.paymentStatus === 'paid' && checkoutOrderId() === data.orderId) {
      cartStore.dispatch({ type: 'clear' });
      resetCheckoutSession();
    }
  }, [data]);

  // Gentle heads-up when the order becomes ready while the page is open.
  useEffect(() => {
    if (!data) return;
    if (previousStatus.current && previousStatus.current !== data.status && data.status === 'ready') {
      toast.success('Your order is ready for pickup!', { description: `Order ${data.orderNumber}` });
      navigator.vibrate?.(200);
    }
    previousStatus.current = data.status;
  }, [data]);

  if (!supabaseConfig.isConfigured) {
    return (
      <Container className="py-14">
        <SetupRequired />
      </Container>
    );
  }

  if (receipt.isPending) {
    return (
      <Container className="max-w-2xl py-10">
        <Skeleton className="h-[38rem] rounded-3xl" />
      </Container>
    );
  }

  if (receipt.isError) {
    return (
      <Container className="max-w-2xl py-14">
        <ErrorState
          error={receipt.error}
          title="We couldn’t load this order"
          onRetry={() => void receipt.refetch()}
        />
      </Container>
    );
  }

  if (!data) {
    return (
      <Container className="max-w-2xl py-14">
        <EmptyState
          icon={ReceiptText}
          title="Order not found"
          description="This receipt is only available on the device the order was placed from, or through its receipt link."
          action={
            <Button asChild variant="outline">
              <Link to="/orders">Go to my orders</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  const timeZone = settings.data?.timezone;
  const expired = data.status === 'payment_pending' && new Date(data.paymentExpiresAt).getTime() <= now;
  const awaitingConfirmation =
    data.status === 'payment_pending' &&
    !expired &&
    (fromCheckout === 'pending_confirmation' ||
      (fromCheckout === 'confirmed' && data.paymentStatus === 'pending'));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(receiptUrl(data.orderId, token));
      toast.success('Receipt link copied', {
        description: token ? 'Anyone with this link can view this receipt — keep it private.' : undefined,
      });
    } catch {
      toast.error('Couldn’t copy the link');
    }
  };

  const saveAsPdf = () => {
    const previousTitle = document.title;
    document.title = `${data.orderNumber} receipt`;
    window.print();
    document.title = previousTitle;
  };

  return (
    <Container className="max-w-2xl py-10 sm:py-14">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/orders">
            <ArrowLeft /> My orders
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {receipt.live ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-status-ready">
              <Wifi className="size-3.5" aria-hidden="true" /> Live updates
            </span>
          ) : null}
          <OrderStatusBadge status={data.status} size="lg" />
        </div>
      </div>

      {data.status === 'payment_pending' ? (
        <div className="no-print mb-6">
          {awaitingConfirmation ? (
            <Alert variant="info">
              <LoaderCircle className="animate-spin" />
              <AlertTitle>Confirming your payment…</AlertTitle>
              <AlertDescription>
                Razorpay reported your payment and we are verifying it with the bank. This usually takes a few
                seconds — this page updates automatically. If money left your account but the order is not
                confirmed, it will be refunded automatically by Razorpay or the canteen.
              </AlertDescription>
            </Alert>
          ) : expired ? (
            <Alert variant="warning">
              <Hourglass />
              <AlertTitle>This order was not paid</AlertTitle>
              <AlertDescription>
                The payment window closed at {formatDateTime(data.paymentExpiresAt, timeZone)}. Nothing was
                charged. Please place a new order from the menu.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="warning">
              <Hourglass />
              <AlertTitle>
                {data.paymentStatus === 'failed'
                  ? 'Your last payment attempt failed'
                  : 'Payment not completed'}
              </AlertTitle>
              <AlertDescription>
                <p>
                  This order will reach the kitchen only after payment. You can complete it until{' '}
                  {formatDateTime(data.paymentExpiresAt, timeZone)}.
                </p>
                {data.canResumePayment ? (
                  <Button
                    size="sm"
                    className="mt-3"
                    disabled={
                      flow.phase.name !== 'idle' &&
                      flow.phase.name !== 'dismissed' &&
                      flow.phase.name !== 'error'
                    }
                    onClick={() => void flow.resumeCheckout(data.orderId, data.customerName)}
                  >
                    <RefreshCw /> Complete payment
                  </Button>
                ) : null}
                {flow.phase.name === 'error' ? (
                  <p role="alert" className="mt-2 font-semibold">
                    {flow.phase.message}
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          )}
        </div>
      ) : data.status === 'cancelled' ? (
        <Alert variant="destructive" className="no-print mb-6">
          <ReceiptText />
          <AlertTitle>This order was cancelled</AlertTitle>
          <AlertDescription>
            {data.cancellationReason ? `Reason: ${data.cancellationReason}. ` : ''}
            {data.paymentStatus === 'refunded'
              ? 'Your payment has been refunded. Refunds usually reach your account within 5–7 working days.'
              : data.paymentStatus === 'refund_pending' || data.paymentStatus === 'paid'
                ? 'A refund is being processed for your payment.'
                : ''}
          </AlertDescription>
        </Alert>
      ) : (
        <p className="no-print mb-6 text-center text-sm text-muted-foreground">
          {ORDER_STATUS_META[data.status].description}
        </p>
      )}

      <ReceiptCard receipt={data} timeZone={timeZone} />

      <div className="no-print mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
        <Button variant="outline" onClick={saveAsPdf}>
          <FileDown /> Save PDF
        </Button>
        <Button variant="outline" onClick={() => void copyLink()}>
          <Copy /> Copy link
        </Button>
        <Button asChild>
          <Link to="/menu">Back to menu</Link>
        </Button>
      </div>
      <p className="no-print mt-3 text-center text-xs text-muted-foreground">
        “Save PDF” opens the print dialog — choose “Save as PDF” as the destination.
      </p>

      <PaymentProgress
        phase={flow.phase}
        attemptError={flow.attemptError}
        onConfirmTotal={flow.resolveTotalConfirmation}
      />
    </Container>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ReceiptText, RotateCcw, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { CancelOrderDialog } from '@/components/admin/cancel-order-dialog';
import { useStaff } from '@/components/admin/staff-context';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { EmptyState, ErrorState } from '@/components/common/states';
import { VegIndicator } from '@/components/common/veg-indicator';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { announceRefund, useStatusMutation } from '@/hooks/admin/use-status-mutation';
import { usePageTitle } from '@/hooks/use-page-title';
import { formatDateTime } from '@/lib/dates';
import { messageFor } from '@/lib/errors';
import { formatPaise } from '@/lib/money';
import { ADMIN_STATUS_LABEL, staffActionsFor } from '@/lib/order-status';
import { fetchOrderDetail, requestRefund } from '@/services/admin/orders';

const SOURCE_LABEL: Record<string, string> = {
  system: 'System',
  payment: 'Payment verification',
  staff: 'Staff',
  admin: 'Administrator',
};

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{children}</dd>
    </div>
  );
}

export default function AdminOrderDetailPage() {
  const { orderId = '' } = useParams();
  const { isAdmin } = useStaff();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const statusMutation = useStatusMutation();
  const order = useQuery({ queryKey: ['admin', 'order', orderId], queryFn: () => fetchOrderDetail(orderId) });
  usePageTitle(order.data ? `Order ${order.data.orderNumber}` : 'Order');

  const refund = useMutation({
    mutationFn: () => requestRefund(orderId),
    onSuccess: (result) => announceRefund(result),
    onError: (error) => toast.error(messageFor(error)),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  if (order.isPending) return <Skeleton className="mx-auto h-[32rem] max-w-5xl rounded-2xl" />;
  if (order.isError) return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  if (!order.data) {
    return <EmptyState icon={ReceiptText} title="Order not found" action={<Button asChild variant="outline"><Link to="/admin/orders">All orders</Link></Button>} />;
  }

  const data = order.data;
  const actions = staffActionsFor(data.status);
  const lastRefund = data.refunds.at(-1);
  const refundable =
    isAdmin &&
    data.status === 'cancelled' &&
    (data.paymentStatus === 'paid' ||
      (data.paymentStatus === 'refund_pending' && (!lastRefund || (lastRefund.status === 'failed' && !lastRefund.providerRefundId))));
  const canCancel = isAdmin && !['completed', 'cancelled'].includes(data.status);

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
        <Link to="/admin/orders">
          <ArrowLeft /> All orders
        </Link>
      </Button>
      <AdminPageHeader
        title={<span className="tabular">{data.orderNumber}</span>}
        description={`Placed ${formatDateTime(data.createdAt)} by ${data.customerName}`}
        actions={
          <>
            <OrderStatusBadge status={data.status} variant="admin" size="lg" />
            <PaymentStatusBadge status={data.paymentStatus} />
          </>
        }
      />

      {actions.length > 0 || canCancel || refundable ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.to}
              size="lg"
              variant={action.primary ? 'default' : 'outline'}
              disabled={statusMutation.isPending}
              onClick={() =>
                statusMutation.mutate({
                  orderId: data.id,
                  orderNumber: data.orderNumber,
                  status: action.to,
                  expectedStatus: data.status,
                })
              }
            >
              {action.label}
            </Button>
          ))}
          {refundable ? (
            <Button size="lg" variant="outline" disabled={refund.isPending} onClick={() => refund.mutate()}>
              <RotateCcw /> {data.paymentStatus === 'paid' ? 'Refund payment' : 'Retry refund'}
            </Button>
          ) : null}
          {canCancel ? (
            <Button size="lg" variant="ghost" className="text-destructive" onClick={() => setCancelOpen(true)}>
              <XCircle /> Cancel order
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="items-heading" className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <h2 id="items-heading" className="text-lg font-semibold">
            Items
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {data.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 py-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <span className="tabular">{item.quantity}×</span>
                    <VegIndicator vegetarian={item.isVegetarian} className="size-3.5" />
                    {item.name}
                  </p>
                  {item.customizations.length > 0 ? (
                    <p className="mt-0.5 text-sm text-honey">
                      + {item.customizations.map((c) => `${c.name}${c.priceDeltaPaise ? ` (${formatPaise(c.priceDeltaPaise)})` : ''}`).join(', ')}
                    </p>
                  ) : null}
                  {item.note ? <p className="mt-0.5 text-sm text-muted-foreground italic">“{item.note}”</p> : null}
                </div>
                <div className="text-right text-sm">
                  <p className="tabular font-semibold">{formatPaise(item.lineTotalPaise)}</p>
                  <p className="tabular text-xs text-muted-foreground">{formatPaise(item.unitPricePaise)} each</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
            <span>Total</span>
            <span className="tabular font-display text-2xl font-medium">{formatPaise(data.totalPaise)}</span>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <Detail label="Customer">{data.customerName}</Detail>
            <Detail label="Student ID">{data.studentIdentifier ?? '—'}</Detail>
            {data.cancellationReason ? <Detail label="Cancellation reason">{data.cancellationReason}</Detail> : null}
          </dl>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="payment-heading" className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 id="payment-heading" className="text-lg font-semibold">
              Payment
            </h2>
            {data.payment ? (
              <dl className="mt-3 grid gap-3 text-sm">
                <Detail label="Provider">Razorpay</Detail>
                <Detail label="Razorpay order">
                  <span className="font-mono text-xs">{data.payment.providerOrderId}</span>
                </Detail>
                <Detail label="Payment reference">
                  <span className="font-mono text-xs">{data.payment.providerPaymentId ?? '—'}</span>
                </Detail>
                <Detail label="Amount">{formatPaise(data.payment.amountPaise)}</Detail>
                <Detail label="Verified">
                  {data.payment.verifiedAt
                    ? `${formatDateTime(data.payment.verifiedAt)} via ${data.payment.verificationSource === 'webhook' ? 'webhook' : 'checkout signature'}`
                    : 'Not verified'}
                </Detail>
                {data.payment.method ? <Detail label="Method">{data.payment.method.toUpperCase()}</Detail> : null}
                {data.payment.amountRefundedPaise > 0 ? (
                  <Detail label="Refunded">{formatPaise(data.payment.amountRefundedPaise)}</Detail>
                ) : null}
                {data.payment.failureReason ? <Detail label="Last failure">{data.payment.failureReason}</Detail> : null}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No payment has been started for this order.</p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Payment details are recorded only by the server after verifying Razorpay’s signature. They cannot be edited here.
            </p>
          </section>

          {data.refunds.length > 0 ? (
            <section aria-labelledby="refunds-heading" className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
              <h2 id="refunds-heading" className="text-lg font-semibold">
                Refunds
              </h2>
              <ul className="mt-3 space-y-3 text-sm">
                {data.refunds.map((entry) => (
                  <li key={entry.id} className="rounded-xl bg-muted/50 p-3">
                    <p className="flex justify-between font-semibold">
                      <span className="capitalize">{entry.status}</span>
                      <span className="tabular">{formatPaise(entry.amountPaise)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                      {entry.initiatedBy ? ` · by ${entry.initiatedBy}` : ''}
                      {entry.providerRefundId ? ` · ${entry.providerRefundId}` : ''}
                    </p>
                    {entry.failureReason ? <p className="mt-1 text-xs text-status-cancelled">{entry.failureReason}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="history-heading" className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 id="history-heading" className="text-lg font-semibold">
              Status history
            </h2>
            <ol className="mt-3 space-y-3 border-l-2 border-border pl-4 text-sm">
              {data.history.map((entry) => (
                <li key={entry.id} className="relative">
                  <span className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-primary ring-4 ring-card" aria-hidden="true" />
                  <p className="font-semibold">
                    {entry.previousStatus ? `${ADMIN_STATUS_LABEL[entry.previousStatus]} → ` : ''}
                    {ADMIN_STATUS_LABEL[entry.newStatus]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt)} · {entry.actor ?? SOURCE_LABEL[entry.source] ?? entry.source}
                  </p>
                  {entry.note ? <p className="mt-0.5 text-xs text-muted-foreground italic">{entry.note}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {canCancel ? <CancelOrderDialog order={data} open={cancelOpen} onOpenChange={setCancelOpen} /> : null}
    </div>
  );
}

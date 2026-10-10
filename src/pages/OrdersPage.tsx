import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ReceiptText } from 'lucide-react';
import { Link } from 'react-router';

import { PageHeader } from '@/components/common/page-header';
import { Price } from '@/components/common/price';
import { OrderStatusBadge } from '@/components/common/status-badge';
import { EmptyState, ErrorState, SetupRequired } from '@/components/common/states';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNow } from '@/hooks/use-now';
import { usePageTitle } from '@/hooks/use-page-title';
import { useSettings } from '@/hooks/use-settings';
import { formatDateTime } from '@/lib/dates';
import { supabaseConfig } from '@/lib/supabase/env';
import { cn } from '@/lib/utils';
import { fetchMyOrders } from '@/services/orders';
import type { MyOrderSummary } from '@/types/domain';

const ACTIVE = new Set(['confirmed', 'accepted', 'preparing', 'ready']);

function OrderRow({ order, timeZone, now }: { order: MyOrderSummary; timeZone?: string; now: number }) {
  const unpaid = order.status === 'payment_pending';
  const expired = unpaid && new Date(order.paymentExpiresAt).getTime() <= now;
  return (
    <li>
      <Link
        to={`/orders/${order.id}`}
        className={cn(
          'group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lift sm:p-5',
          order.status === 'ready' && 'border-status-ready/40 ring-2 ring-status-ready/15',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="tabular font-display text-xl font-medium">{order.orderNumber}</p>
            {expired ? (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                Not paid
              </span>
            ) : (
              <OrderStatusBadge status={order.status} />
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateTime(order.createdAt, timeZone)} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
          </p>
        </div>
        <Price paise={order.totalPaise} className="font-display text-lg font-medium" />
        <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

export default function OrdersPage() {
  usePageTitle('My orders');
  const settings = useSettings();
  const orders = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => fetchMyOrders(),
    enabled: supabaseConfig.isConfigured,
    refetchInterval: (query) => ((query.state.data ?? []).some((order) => ACTIVE.has(order.status)) ? 20_000 : false),
  });
  const timeZone = settings.data?.timezone;
  const now = useNow(30_000);

  const active = (orders.data ?? []).filter((order) => ACTIVE.has(order.status));
  const past = (orders.data ?? []).filter((order) => !ACTIVE.has(order.status));

  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <PageHeader
        eyebrow="Track & collect"
        title="My orders"
        description="Orders placed from this device. Open an order to see its live status and receipt."
      />
      <div className="mt-10">
        {!supabaseConfig.isConfigured ? (
          <SetupRequired />
        ) : orders.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : orders.isError ? (
          <ErrorState error={orders.error} title="We couldn’t load your orders" onRetry={() => void orders.refetch()} />
        ) : orders.data.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No orders yet"
            description="When you place an order it will appear here, with live status updates. Ordered on another device? Use the receipt link from that order."
            action={
              <Button asChild>
                <Link to="/menu">Browse the menu</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-10">
            {active.length > 0 ? (
              <section aria-labelledby="active-heading">
                <h2 id="active-heading" className="mb-3 text-sm font-bold tracking-[0.14em] text-sage uppercase">
                  In progress
                </h2>
                <ul className="space-y-3">
                  {active.map((order) => (
                    <OrderRow key={order.id} order={order} timeZone={timeZone} now={now} />
                  ))}
                </ul>
              </section>
            ) : null}
            {past.length > 0 ? (
              <section aria-labelledby="past-heading">
                <h2 id="past-heading" className="mb-3 text-sm font-bold tracking-[0.14em] text-muted-foreground uppercase">
                  Earlier
                </h2>
                <ul className="space-y-3">
                  {past.map((order) => (
                    <OrderRow key={order.id} order={order} timeZone={timeZone} now={now} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </Container>
  );
}

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CircleAlert,
  CircleCheckBig,
  Clock3,
  CookingPot,
  HandPlatter,
  IndianRupee,
  ReceiptText,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { StatCard } from '@/components/admin/stat-card';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/hooks/use-page-title';
import { useNow } from '@/hooks/use-now';
import { formatElapsed, formatTime, todayInZone } from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import { ADMIN_STATUS_LABEL } from '@/lib/order-status';
import { fetchDashboardStats } from '@/services/admin/dashboard';
import { fetchAttentionOrders } from '@/services/admin/orders';

export default function AdminDashboardPage() {
  usePageTitle('Dashboard');
  const now = useNow();
  const today = todayInZone();
  const [day, setDay] = useState(today);
  const stats = useQuery({
    queryKey: ['admin', 'dashboard', day],
    queryFn: () => fetchDashboardStats(day),
    refetchInterval: 60_000,
  });
  const attention = useQuery({
    queryKey: ['admin', 'dashboard', 'attention'],
    queryFn: fetchAttentionOrders,
  });
  const isToday = day === today;

  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader
        title="Dashboard"
        description={isToday ? 'Today at a glance. Figures update automatically.' : `Figures for ${day}.`}
        actions={
          <>
            <label className="sr-only" htmlFor="dashboard-day">
              Day
            </label>
            <Input
              id="dashboard-day"
              type="date"
              value={day}
              max={today}
              onChange={(event) => setDay(event.target.value || today)}
              className="h-10 w-auto"
            />
            <Button asChild>
              <Link to="/admin/queue">
                Open live queue <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      {stats.isError ? (
        <ErrorState
          error={stats.error}
          title="Couldn’t load dashboard figures"
          onRetry={() => void stats.refetch()}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.data ? (
            <>
              <StatCard
                label={isToday ? 'Paid orders today' : 'Paid orders'}
                value={stats.data.ordersToday}
                icon={ReceiptText}
              />
              <StatCard
                label="Awaiting preparation"
                value={stats.data.awaitingPreparation}
                icon={Clock3}
                tone="new"
                hint="Paid orders not yet started (live)"
              />
              <StatCard
                label="Preparing"
                value={stats.data.preparing}
                icon={CookingPot}
                tone="preparing"
                hint="Live"
              />
              <StatCard
                label="Ready for pickup"
                value={stats.data.readyForPickup}
                icon={HandPlatter}
                tone="ready"
                hint="Live"
              />
              <StatCard
                label={isToday ? 'Completed today' : 'Completed'}
                value={stats.data.completedToday}
                icon={CircleCheckBig}
                hint={
                  stats.data.cancelledToday > 0
                    ? `${stats.data.cancelledToday} paid order(s) cancelled`
                    : undefined
                }
              />
              <StatCard
                label="Net revenue"
                value={formatPaise(stats.data.netRevenuePaise)}
                icon={IndianRupee}
                tone="money"
                hint={`Verified payments ${formatPaise(stats.data.grossRevenuePaise)} − refunds ${formatPaise(stats.data.refundedPaise)}`}
              />
            </>
          ) : (
            Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section
          aria-labelledby="attention-heading"
          className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6"
        >
          <h2 id="attention-heading" className="flex items-center gap-2 text-lg font-semibold">
            <CircleAlert className="size-5 text-honey" aria-hidden="true" /> Needs attention
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cancelled orders whose payment still needs to be refunded.
          </p>
          {attention.data && attention.data.length > 0 ? (
            <ul className="mt-4 divide-y divide-border">
              {attention.data.map((order) => (
                <li key={order.id}>
                  <Link
                    to={`/admin/orders/${order.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:text-primary"
                  >
                    <span className="tabular font-semibold">{order.orderNumber}</span>
                    <span className="flex items-center gap-2">
                      <PaymentStatusBadge status={order.paymentStatus} />
                      <span className="tabular text-sm">{formatPaise(order.totalPaise)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
              {attention.isPending ? 'Checking…' : 'Nothing needs attention. 🎉'}
            </p>
          )}
        </section>

        <section
          aria-labelledby="activity-heading"
          className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6"
        >
          <h2 id="activity-heading" className="text-lg font-semibold">
            Recent activity
          </h2>
          {stats.data && stats.data.recentActivity.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {stats.data.recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <Link
                      to={`/admin/orders/${entry.orderId}`}
                      className="tabular font-semibold hover:text-primary"
                    >
                      {entry.orderNumber}
                    </Link>{' '}
                    <span className="text-muted-foreground">→ {ADMIN_STATUS_LABEL[entry.newStatus]}</span>
                    <p className="text-xs text-muted-foreground">
                      {entry.source === 'payment'
                        ? 'Payment verified'
                        : entry.actor
                          ? `by ${entry.actor}`
                          : entry.source === 'system'
                            ? 'System'
                            : 'Staff'}{' '}
                      · {formatTime(entry.at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <OrderStatusBadge status={entry.newStatus} variant="admin" />
                    <span className="text-[0.7rem] text-muted-foreground">
                      {formatElapsed(entry.at, now)} ago
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
              {stats.isPending ? 'Loading…' : 'No activity yet today.'}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';

import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/hooks/use-page-title';
import { formatDateTime } from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import { ADMIN_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '@/lib/order-status';
import { fetchOrders, type OrderFilters } from '@/services/admin/orders';
import { ORDER_STATUSES, PAYMENT_STATUSES, type OrderStatus, type PaymentStatus } from '@/types/domain';

const PAGE_SIZE = 25;

/** Converts a YYYY-MM-DD date (local to this browser) into an ISO instant. */
function dayStart(date: string | null, offsetDays = 0): string | null {
  if (!date) return null;
  const value = new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) return null;
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString();
}

export default function AdminOrdersPage() {
  usePageTitle('Orders');
  const [params, setParams] = useSearchParams();
  const filters: OrderFilters = useMemo(
    () => ({
      search: params.get('q') ?? '',
      status: (params.get('status') as OrderStatus | null) ?? 'all',
      paymentStatus: (params.get('payment') as PaymentStatus | null) ?? 'all',
      from: dayStart(params.get('from')),
      to: dayStart(params.get('to'), 1),
      page: Math.max(0, Number(params.get('page') ?? '0') || 0),
      pageSize: PAGE_SIZE,
    }),
    [params],
  );

  const orders = useQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: () => fetchOrders(filters),
    placeholderData: keepPreviousData,
  });

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const total = orders.data?.total ?? 0;
  const first = filters.page * PAGE_SIZE + 1;
  const last = Math.min(total, (filters.page + 1) * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader
        title="Orders"
        description="Search the full order history. Completed orders are never deleted."
      />

      <div className="mb-5 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-1.5 lg:col-span-1">
          <Label htmlFor="orders-search">Order number</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="orders-search"
              type="search"
              value={params.get('q') ?? ''}
              onChange={(event) => set('q', event.target.value)}
              placeholder="CT-2026…"
              className="h-10 pl-9"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="orders-status">Status</Label>
          <NativeSelect
            id="orders-status"
            value={filters.status}
            onChange={(event) => set('status', event.target.value)}
          >
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ADMIN_STATUS_LABEL[status]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="orders-payment">Payment</Label>
          <NativeSelect
            id="orders-payment"
            value={filters.paymentStatus}
            onChange={(event) => set('payment', event.target.value)}
          >
            <option value="all">All payments</option>
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PAYMENT_STATUS_LABEL[status]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="orders-from">From</Label>
          <Input
            id="orders-from"
            type="date"
            className="h-11"
            value={params.get('from') ?? ''}
            onChange={(event) => set('from', event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="orders-to">To</Label>
          <Input
            id="orders-to"
            type="date"
            className="h-11"
            value={params.get('to') ?? ''}
            onChange={(event) => set('to', event.target.value)}
          />
        </div>
      </div>

      {orders.isError ? (
        <ErrorState error={orders.error} title="Couldn’t load orders" onRetry={() => void orders.refetch()} />
      ) : !orders.data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : orders.data.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No orders match these filters.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <caption className="sr-only">Orders</caption>
            <thead className="hidden border-b border-border bg-muted/50 text-left text-xs text-muted-foreground md:table-header-group">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Order
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Placed
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Customer
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Total
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Payment
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.data.rows.map((order) => (
                <tr
                  key={order.id}
                  className="grid grid-cols-2 gap-1 px-4 py-3 hover:bg-muted/40 md:table-row md:p-0"
                >
                  <td className="md:px-4 md:py-3">
                    <Link
                      to={`/admin/orders/${order.id}`}
                      className="tabular font-semibold text-primary hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="text-right text-muted-foreground md:px-4 md:py-3 md:text-left">
                    {formatDateTime(order.createdAt)}
                  </td>
                  <td className="md:px-4 md:py-3">
                    {order.customerName}
                    <span className="block text-xs text-muted-foreground">
                      {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td className="tabular text-right font-semibold md:px-4 md:py-3">
                    {formatPaise(order.totalPaise)}
                  </td>
                  <td className="md:px-4 md:py-3">
                    <PaymentStatusBadge status={order.paymentStatus} />
                  </td>
                  <td className="text-right md:px-4 md:py-3 md:text-left">
                    <OrderStatusBadge status={order.status} variant="admin" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {first}–{last} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === 0}
                onClick={() => set('page', String(filters.page - 1))}
              >
                <ChevronLeft /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={last >= total}
                onClick={() => set('page', String(filters.page + 1))}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

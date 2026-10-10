import { CircleCheckBig, Clock3, CookingPot, HandPlatter, Search, type LucideIcon } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useMemo, useState } from 'react';

import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { OrderCard } from '@/components/admin/order-card';
import { ErrorState } from '@/components/common/states';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminQueue } from '@/hooks/admin/use-admin-queue';
import { useNow } from '@/hooks/use-now';
import { usePageTitle } from '@/hooks/use-page-title';
import { queueColumnFor, type QueueColumn } from '@/lib/order-status';
import { cn } from '@/lib/utils';
import type { AdminOrder } from '@/services/admin/types';

const COLUMNS: { key: QueueColumn; title: string; icon: LucideIcon; empty: string; accent: string }[] = [
  { key: 'new', title: 'New / confirmed', icon: Clock3, empty: 'No new orders', accent: 'bg-status-new' },
  {
    key: 'preparing',
    title: 'Preparing',
    icon: CookingPot,
    empty: 'Nothing cooking',
    accent: 'bg-status-preparing',
  },
  {
    key: 'ready',
    title: 'Ready for pickup',
    icon: HandPlatter,
    empty: 'Nothing waiting',
    accent: 'bg-status-ready',
  },
  {
    key: 'completed',
    title: 'Completed',
    icon: CircleCheckBig,
    empty: 'None yet',
    accent: 'bg-status-completed',
  },
];

function Column({
  column,
  orders,
  now,
}: {
  column: (typeof COLUMNS)[number];
  orders: AdminOrder[];
  now: number;
}) {
  return (
    <section
      aria-labelledby={`col-${column.key}`}
      className="flex min-w-0 flex-col rounded-3xl bg-[#ece8de]/70 p-2.5"
    >
      <header className="flex items-center justify-between px-2 pt-1 pb-3">
        <h2
          id={`col-${column.key}`}
          className="flex items-center gap-2 text-sm font-bold tracking-wide uppercase"
        >
          <span className={cn('size-2.5 rounded-full', column.accent)} aria-hidden="true" />
          {column.title}
        </h2>
        <span className="tabular rounded-full bg-card px-2.5 py-0.5 text-sm font-bold shadow-soft">
          {orders.length}
        </span>
      </header>
      <div className="flex flex-col gap-3">
        <AnimatePresence initial={false} mode="popLayout">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} now={now} compact={column.key === 'completed'} />
          ))}
        </AnimatePresence>
        {orders.length === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-10 text-sm text-muted-foreground">
            <column.icon className="size-5" aria-hidden="true" />
            {column.empty}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default function AdminQueuePage() {
  usePageTitle('Live queue');
  const queue = useAdminQueue();
  const now = useNow(30_000);
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const term = search.trim().toUpperCase();
    const groups: Record<QueueColumn, AdminOrder[]> = { new: [], preparing: [], ready: [], completed: [] };
    for (const order of queue.data ?? []) {
      if (term && !order.orderNumber.includes(term) && !order.customerName.toUpperCase().includes(term))
        continue;
      const column = queueColumnFor(order.status);
      if (column) groups[column].push(order);
    }
    return groups;
  }, [queue.data, search]);

  return (
    <div>
      <AdminPageHeader
        title="Live queue"
        description="Paid orders appear here automatically. Oldest first."
        actions={
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find order no. or name"
              aria-label="Search orders in the queue"
              className="h-10 w-64 pl-9"
            />
          </div>
        }
      />

      {queue.isError && !queue.data ? (
        <ErrorState
          error={queue.error}
          title="Couldn’t load the queue"
          onRetry={() => void queue.refetch()}
        />
      ) : queue.isPending ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-96 rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Board on wide screens */}
          <div className="hidden items-start gap-4 lg:grid lg:grid-cols-4">
            {COLUMNS.map((column) => (
              <Column key={column.key} column={column} orders={grouped[column.key]} now={now} />
            ))}
          </div>
          {/* Tabs on tablets in portrait and phones */}
          <Tabs defaultValue="new" className="lg:hidden">
            <TabsList className="scrollbar-none mb-4 w-full justify-start overflow-x-auto">
              {COLUMNS.map((column) => (
                <TabsTrigger key={column.key} value={column.key} className="flex-1">
                  {column.title.split(' /')[0]}
                  <span className="tabular rounded-full bg-muted px-1.5 text-xs">
                    {grouped[column.key].length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {COLUMNS.map((column) => (
              <TabsContent key={column.key} value={column.key}>
                <Column column={column} orders={grouped[column.key]} now={now} />
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}
    </div>
  );
}

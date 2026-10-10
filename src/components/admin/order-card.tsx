import { Ellipsis, ExternalLink, ShieldCheck, Undo2, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';

import { VegIndicator } from '@/components/common/veg-indicator';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStatusMutation } from '@/hooks/admin/use-status-mutation';
import { formatElapsed, formatTime } from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import { staffActionsFor } from '@/lib/order-status';
import { cn } from '@/lib/utils';
import type { AdminOrder } from '@/services/admin/types';
import type { OrderStatus } from '@/types/domain';

import { useAdminRealtime } from './admin-realtime';
import { CancelOrderDialog } from './cancel-order-dialog';
import { useStaff } from './staff-context';

function splitNumber(orderNumber: string) {
  const index = orderNumber.lastIndexOf('-');
  return index > 0 ? { prefix: orderNumber.slice(0, index), short: orderNumber.slice(index + 1) } : { prefix: '', short: orderNumber };
}

export function OrderCard({ order, now, compact = false }: { order: AdminOrder; now: number; compact?: boolean }) {
  const { isAdmin } = useStaff();
  const { newOrderIds, acknowledge } = useAdminRealtime();
  const mutation = useStatusMutation();
  const [cancelOpen, setCancelOpen] = useState(false);
  const isNew = newOrderIds.has(order.id);
  const { prefix, short } = splitNumber(order.orderNumber);
  const actions = staffActionsFor(order.status);
  const primary = actions.find((action) => action.primary);
  const secondary = actions.filter((action) => !action.primary);
  const since = order.paidAt ?? order.createdAt;

  const run = (to: OrderStatus) => {
    acknowledge(order.id);
    mutation.mutate({ orderId: order.id, orderNumber: order.orderNumber, status: to, expectedStatus: order.status });
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      aria-label={`Order ${order.orderNumber}${isNew ? ', new' : ''}`}
      onPointerDown={() => isNew && acknowledge(order.id)}
      className={cn(
        'flex flex-col rounded-2xl border border-border bg-card shadow-soft',
        isNew && 'animate-highlight border-honey ring-2 ring-honey/60',
        compact && 'opacity-90',
      )}
    >
      <header className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0">
          <p className="tabular text-[0.7rem] font-semibold text-muted-foreground">{prefix}</p>
          <p className={cn('tabular font-display leading-none font-semibold tracking-tight', compact ? 'text-3xl' : 'text-[2.6rem]')}>
            {short}
          </p>
        </div>
        <div className="text-right">
          {isNew ? (
            <span className="mb-1 inline-block rounded-full bg-honey px-2 py-0.5 text-[0.68rem] font-bold tracking-wider text-white uppercase">
              New
            </span>
          ) : null}
          <p className="tabular text-sm font-bold">{formatTime(since)}</p>
          <p className="text-xs text-muted-foreground">{formatElapsed(since, now)}</p>
        </div>
      </header>

      <p className="truncate px-4 text-sm font-semibold">
        {order.customerName}
        {order.studentIdentifier ? <span className="font-normal text-muted-foreground"> · {order.studentIdentifier}</span> : null}
      </p>

      {!compact ? (
        <ul className="mx-4 my-3 space-y-2 border-y border-dashed border-border py-3">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-2.5">
              <span className="tabular w-8 shrink-0 text-lg leading-6 font-bold">{item.quantity}×</span>
              <div className="min-w-0">
                <p className="flex items-start gap-1.5 leading-6 font-semibold">
                  <VegIndicator vegetarian={item.isVegetarian} className="mt-[0.3rem] size-3.5" />
                  {item.name}
                </p>
                {item.customizations.length > 0 ? (
                  <p className="text-sm font-semibold text-honey">+ {item.customizations.map((c) => c.name).join(', ')}</p>
                ) : null}
                {item.note ? <p className="text-sm text-status-preparing italic">“{item.note}”</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 pt-1 pb-3 text-xs text-muted-foreground">
          {order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}
        </p>
      )}

      <div className="flex items-center justify-between px-4 pb-3 text-sm">
        <span className="inline-flex items-center gap-1 font-semibold text-status-ready">
          <ShieldCheck className="size-4" aria-hidden="true" /> Paid · verified
        </span>
        <span className="tabular font-bold">{formatPaise(order.totalPaise)}</span>
      </div>

      {!compact ? (
        <footer className="mt-auto grid gap-2 p-3 pt-0">
          {primary ? (
            <Button size="xl" className="w-full text-base" disabled={mutation.isPending} onClick={() => run(primary.to)}>
              {primary.label}
            </Button>
          ) : null}
          <div className="flex gap-2">
            {secondary.map((action) => (
              <Button
                key={action.to}
                variant="outline"
                className="h-11 flex-1 rounded-xl"
                disabled={mutation.isPending}
                onClick={() => run(action.to)}
              >
                {action.label}
              </Button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('h-11 rounded-xl', secondary.length === 0 ? 'flex-1' : 'w-11 px-0')}
                  aria-label={`More actions for ${order.orderNumber}`}
                >
                  <Ellipsis className="size-5" />
                  {secondary.length === 0 ? <span className="text-sm">More</span> : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to={`/admin/orders/${order.id}`}>
                    <ExternalLink /> View details
                  </Link>
                </DropdownMenuItem>
                {order.status === 'ready' ? (
                  <DropdownMenuItem onSelect={() => run('preparing')}>
                    <Undo2 /> Back to preparing
                  </DropdownMenuItem>
                ) : null}
                {isAdmin ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setCancelOpen(true)}>
                      <XCircle /> Cancel order…
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </footer>
      ) : null}

      {isAdmin ? <CancelOrderDialog order={order} open={cancelOpen} onOpenChange={setCancelOpen} /> : null}
    </motion.article>
  );
}

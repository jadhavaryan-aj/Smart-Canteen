import {
  CircleCheckBig,
  Clock3,
  CookingPot,
  HandPlatter,
  Hourglass,
  Ban,
  type LucideIcon,
} from 'lucide-react';

import {
  ADMIN_STATUS_LABEL,
  ORDER_STATUS_META,
  PAYMENT_STATUS_LABEL,
  TONE_CLASSES,
} from '@/lib/order-status';
import { cn } from '@/lib/utils';
import type { OrderStatus, PaymentStatus } from '@/types/domain';

const ICONS: Record<OrderStatus, LucideIcon> = {
  payment_pending: Hourglass,
  confirmed: Clock3,
  accepted: Clock3,
  preparing: CookingPot,
  ready: HandPlatter,
  completed: CircleCheckBig,
  cancelled: Ban,
};

export function OrderStatusBadge({
  status,
  variant = 'student',
  size = 'default',
  className,
}: {
  status: OrderStatus;
  variant?: 'student' | 'admin';
  size?: 'default' | 'lg';
  className?: string;
}) {
  const meta = ORDER_STATUS_META[status];
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
        size === 'lg' ? 'px-3.5 py-1.5 text-sm [&_svg]:size-4' : 'px-2.5 py-1 text-xs [&_svg]:size-3.5',
        TONE_CLASSES[meta.tone],
        className,
      )}
    >
      <Icon aria-hidden="true" />
      {variant === 'admin' ? ADMIN_STATUS_LABEL[status] : meta.label}
    </span>
  );
}

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  pending: TONE_CLASSES.pending,
  paid: TONE_CLASSES.ready,
  failed: TONE_CLASSES.cancelled,
  refund_pending: TONE_CLASSES.new,
  partially_refunded: TONE_CLASSES.new,
  refunded: TONE_CLASSES.completed,
};

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        PAYMENT_TONE[status],
        className,
      )}
    >
      {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}

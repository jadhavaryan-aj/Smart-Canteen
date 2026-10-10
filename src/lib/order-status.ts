import type { OrderStatus, PaymentStatus } from '@/types/domain';

export interface StatusMeta {
  label: string;
  /** Short student-facing explanation. */
  description: string;
  tone: 'pending' | 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled';
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  payment_pending: {
    label: 'Payment pending',
    description: 'Waiting for your payment to be confirmed.',
    tone: 'pending',
  },
  confirmed: {
    label: 'Confirmed',
    description: 'Payment received. The kitchen has your order.',
    tone: 'new',
  },
  accepted: {
    label: 'Confirmed',
    description: 'The kitchen has accepted your order.',
    tone: 'new',
  },
  preparing: { label: 'Preparing', description: 'Your food is being prepared.', tone: 'preparing' },
  ready: {
    label: 'Ready for pickup',
    description: 'Show your order number at the counter to collect it.',
    tone: 'ready',
  },
  completed: { label: 'Completed', description: 'Collected. Enjoy your meal!', tone: 'completed' },
  cancelled: { label: 'Cancelled', description: 'This order was cancelled.', tone: 'cancelled' },
};

/** Admin labels distinguish "accepted" from a brand-new confirmed order. */
export const ADMIN_STATUS_LABEL: Record<OrderStatus, string> = {
  payment_pending: 'Awaiting payment',
  confirmed: 'New',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Payment failed',
  refund_pending: 'Refund in progress',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
};

export const TONE_CLASSES: Record<StatusMeta['tone'], string> = {
  pending: 'bg-status-pending-soft text-status-pending',
  new: 'bg-status-new-soft text-status-new',
  preparing: 'bg-status-preparing-soft text-status-preparing',
  ready: 'bg-status-ready-soft text-status-ready',
  completed: 'bg-status-completed-soft text-status-completed',
  cancelled: 'bg-status-cancelled-soft text-status-cancelled',
};

/** The progress steps shown to students once an order is paid. */
export const STUDENT_STEPS: { key: 'confirmed' | 'preparing' | 'ready' | 'completed'; label: string }[] = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'completed', label: 'Collected' },
];

export function studentStepIndex(status: OrderStatus): number {
  switch (status) {
    case 'confirmed':
    case 'accepted':
      return 0;
    case 'preparing':
      return 1;
    case 'ready':
      return 2;
    case 'completed':
      return 3;
    default:
      return -1;
  }
}

export const ACTIVE_KITCHEN_STATUSES = ['confirmed', 'accepted', 'preparing', 'ready'] as const;

export type QueueColumn = 'new' | 'preparing' | 'ready' | 'completed';

export function queueColumnFor(status: OrderStatus): QueueColumn | null {
  switch (status) {
    case 'confirmed':
    case 'accepted':
      return 'new';
    case 'preparing':
      return 'preparing';
    case 'ready':
      return 'ready';
    case 'completed':
      return 'completed';
    default:
      return null;
  }
}

export interface StaffAction {
  to: OrderStatus;
  label: string;
  primary: boolean;
}

/** Mirrors public.is_valid_staff_transition (the database is the authority). */
export const STAFF_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  payment_pending: ['cancelled'],
  confirmed: ['accepted', 'preparing', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'preparing', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function isValidStaffTransition(from: OrderStatus, to: OrderStatus): boolean {
  return STAFF_TRANSITIONS[from].includes(to);
}

/** Buttons shown on a queue card (cancellation is offered separately to admins). */
export function staffActionsFor(status: OrderStatus): StaffAction[] {
  switch (status) {
    case 'confirmed':
      return [
        { to: 'accepted', label: 'Accept', primary: false },
        { to: 'preparing', label: 'Start preparing', primary: true },
      ];
    case 'accepted':
      return [{ to: 'preparing', label: 'Start preparing', primary: true }];
    case 'preparing':
      return [{ to: 'ready', label: 'Mark ready', primary: true }];
    case 'ready':
      return [{ to: 'completed', label: 'Complete pickup', primary: true }];
    default:
      return [];
  }
}

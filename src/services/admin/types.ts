import type { OrderStatus, PaymentStatus } from '@/types/domain';

export interface AdminOrderItem {
  id: string;
  lineNumber: number;
  name: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  isVegetarian: boolean;
  customizations: { name: string; priceDeltaPaise: number }[];
  note: string | null;
}

export interface AdminPayment {
  provider: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  status: string;
  method: string | null;
  amountPaise: number;
  amountRefundedPaise: number;
  verifiedAt: string | null;
  verificationSource: string | null;
  failureReason: string | null;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerName: string;
  studentIdentifier: string | null;
  totalPaise: number;
  itemCount: number;
  createdAt: string;
  paidAt: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  items: AdminOrderItem[];
  payment: AdminPayment | null;
}

export interface AdminRefund {
  id: string;
  providerRefundId: string | null;
  amountPaise: number;
  status: 'pending' | 'processed' | 'failed';
  reason: string | null;
  failureReason: string | null;
  initiatedBy: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface AdminHistoryEntry {
  id: number;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  source: 'system' | 'payment' | 'staff' | 'admin';
  note: string | null;
  actor: string | null;
  createdAt: string;
}

export interface AdminOrderDetail extends AdminOrder {
  refunds: AdminRefund[];
  history: AdminHistoryEntry[];
}

export interface DashboardStats {
  day: string;
  timezone: string;
  ordersToday: number;
  awaitingPreparation: number;
  preparing: number;
  readyForPickup: number;
  completedToday: number;
  cancelledToday: number;
  grossRevenuePaise: number;
  refundedPaise: number;
  netRevenuePaise: number;
  needsAttention: number;
  recentActivity: {
    id: number;
    orderId: string;
    orderNumber: string;
    previousStatus: OrderStatus | null;
    newStatus: OrderStatus;
    source: string;
    at: string;
    actor: string | null;
  }[];
}

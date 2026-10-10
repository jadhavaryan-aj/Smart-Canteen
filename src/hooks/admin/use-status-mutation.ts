import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { AppError, messageFor } from '@/lib/errors';
import { formatPaise } from '@/lib/money';
import { ADMIN_STATUS_LABEL } from '@/lib/order-status';
import { updateOrderStatus, type StatusUpdateResult } from '@/services/admin/orders';
import type { AdminOrder } from '@/services/admin/types';
import type { OrderStatus } from '@/types/domain';

import { queueQueryKey } from './use-admin-queue';

export interface StatusChange {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  expectedStatus: OrderStatus;
  note?: string;
}

export function announceRefund(refund: StatusUpdateResult['refund']) {
  if (!refund) return;
  if (!('message' in refund)) {
    toast.success(`Refund of ${formatPaise(refund.amountPaise)} submitted to Razorpay`);
  } else if (refund.state === 'not_configured') {
    toast.warning('Order cancelled — refund needs manual action', { description: refund.message, duration: 12_000 });
  } else {
    toast.error('Order cancelled, but the refund failed', {
      description: `${refund.message} Retry it from the order details page.`,
      duration: 12_000,
    });
  }
}

/** Updates an order's status with an optimistic queue update and conflict handling. */
export function useStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (change: StatusChange) =>
      updateOrderStatus({
        orderId: change.orderId,
        status: change.status,
        expectedStatus: change.expectedStatus,
        note: change.note,
      }),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: queueQueryKey });
      const previous = queryClient.getQueryData<AdminOrder[]>(queueQueryKey);
      queryClient.setQueryData<AdminOrder[]>(queueQueryKey, (orders) =>
        orders?.map((order) => (order.id === change.orderId ? { ...order, status: change.status } : order)),
      );
      return { previous };
    },
    onError: (error, change, context) => {
      if (context?.previous) queryClient.setQueryData(queueQueryKey, context.previous);
      if (error instanceof AppError && error.code === 'STALE_STATUS') {
        toast.info(`${change.orderNumber} was already updated on another screen.`);
      } else {
        toast.error(messageFor(error));
      }
    },
    onSuccess: (result, change) => {
      if (result.changed && change.status !== 'cancelled') {
        toast.success(`${change.orderNumber} → ${ADMIN_STATUS_LABEL[change.status]}`, { duration: 2_500 });
      }
      if (change.status === 'cancelled') {
        toast.success(`${change.orderNumber} cancelled`);
        announceRefund(result.refund);
      }
    },
    onSettled: (_result, _error, change) => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'order', change.orderId] });
    },
  });
}

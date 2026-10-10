import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useStatusMutation } from '@/hooks/admin/use-status-mutation';
import { formatPaise } from '@/lib/money';
import type { OrderStatus, PaymentStatus } from '@/types/domain';

export function CancelOrderDialog({
  order,
  open,
  onOpenChange,
}: {
  order: { id: string; orderNumber: string; status: OrderStatus; paymentStatus: PaymentStatus; totalPaise: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const mutation = useStatusMutation();
  const paid = order.paymentStatus === 'paid';
  const valid = reason.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel order {order.orderNumber}?</DialogTitle>
          <DialogDescription>The student will see the order as cancelled. This cannot be undone.</DialogDescription>
        </DialogHeader>
        {paid ? (
          <Alert variant="warning">
            <AlertDescription>
              A full refund of <strong>{formatPaise(order.totalPaise)}</strong> will be submitted to Razorpay
              automatically.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor={`cancel-reason-${order.id}`}>Reason (shown to the student)</Label>
          <Textarea
            id={`cancel-reason-${order.id}`}
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Item ran out before preparation"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep order
          </Button>
          <Button
            variant="destructive"
            disabled={!valid || mutation.isPending}
            onClick={() =>
              mutation.mutate(
                {
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  status: 'cancelled',
                  expectedStatus: order.status,
                  note: reason.trim(),
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {paid ? 'Cancel & refund' : 'Cancel order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

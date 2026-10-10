import { LoaderCircle, ShieldCheck } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { CheckoutPhase } from '@/hooks/use-checkout-flow';
import { formatPaise } from '@/lib/money';

const COPY: Partial<Record<CheckoutPhase['name'], { title: string; body: string }>> = {
  creating: { title: 'Preparing your order…', body: 'Checking prices and availability with the kitchen.' },
  paying: {
    title: 'Complete your payment',
    body: 'Finish paying in the secure Razorpay window. Closing it leaves your order unpaid.',
  },
  verifying: {
    title: 'Confirming your payment…',
    body: 'Please keep this page open while we verify the payment with the bank.',
  },
};

export function PaymentProgress({
  phase,
  attemptError,
  onConfirmTotal,
}: {
  phase: CheckoutPhase;
  attemptError: string | null;
  onConfirmTotal: (proceed: boolean) => void;
}) {
  const copy = COPY[phase.name];

  if (phase.name === 'confirm_total') {
    return (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>The total has changed</AlertDialogTitle>
            <AlertDialogDescription>
              A price changed while you were checking out. The amount to pay is now{' '}
              <strong className="text-foreground">{formatPaise(phase.serverTotalPaise)}</strong> (previously{' '}
              {formatPaise(phase.displayedTotalPaise)}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => onConfirmTotal(false)}>Review cart</AlertDialogCancel>
            <AlertDialogAction onClick={() => onConfirmTotal(true)}>
              Pay {formatPaise(phase.serverTotalPaise)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open={Boolean(copy)}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        className="max-w-sm text-center"
      >
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
          {phase.name === 'paying' ? (
            <ShieldCheck className="size-6" aria-hidden="true" />
          ) : (
            <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
          )}
        </span>
        <DialogTitle className="text-2xl">{copy?.title}</DialogTitle>
        <DialogDescription>{copy?.body}</DialogDescription>
        {phase.name === 'paying' && attemptError ? (
          <p
            role="alert"
            className="rounded-xl bg-status-cancelled-soft px-3 py-2 text-sm font-medium text-status-cancelled"
          >
            {attemptError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

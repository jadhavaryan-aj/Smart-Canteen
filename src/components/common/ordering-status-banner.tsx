import { Clock3, PauseCircle, Power } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { nextOpeningText } from '@/lib/ordering';
import type { OrderingStatus } from '@/types/domain';

/** Explains why ordering is unavailable. Renders nothing when ordering is open. */
export function OrderingStatusBanner({ status, timeZone }: { status: OrderingStatus; timeZone: string }) {
  if (status.isOpen) return null;
  const Icon = status.reason === 'paused' ? PauseCircle : status.reason === 'disabled' ? Power : Clock3;
  const next = nextOpeningText(status, timeZone);
  return (
    <Alert variant="warning">
      <Icon aria-hidden="true" />
      <AlertTitle>
        {status.reason === 'paused' ? 'Ordering is paused' : 'Online ordering is closed'}
      </AlertTitle>
      <AlertDescription>
        {status.message}
        {next ? ` ${next}` : ''} You can still browse the menu.
      </AlertDescription>
    </Alert>
  );
}

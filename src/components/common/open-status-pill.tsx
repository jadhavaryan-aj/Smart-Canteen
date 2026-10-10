import { formatClock } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { PublicSettings } from '@/types/domain';

import { nextOpeningText } from '@/lib/ordering';

/** "Open now · until 8:00 PM" / "Closed · Opens tomorrow at 8:00 AM". */
export function OpenStatusPill({ settings, className }: { settings: PublicSettings; className?: string }) {
  const status = settings.orderingStatus;
  const label = status.isOpen
    ? `Open for orders${status.todayHours && !status.todayHours.closed ? ` · until ${formatClock(status.todayHours.close)}` : ''}`
    : status.reason === 'paused'
      ? 'Ordering paused'
      : (nextOpeningText(status, settings.timezone)?.replace(/\.$/, '') ?? 'Closed for orders');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-semibold shadow-soft backdrop-blur',
        className,
      )}
    >
      <span className="relative flex size-2">
        {status.isOpen ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-ready/60 motion-reduce:hidden" />
        ) : null}
        <span className={cn('relative inline-flex size-2 rounded-full', status.isOpen ? 'bg-status-ready' : 'bg-honey')} />
      </span>
      {label}
    </span>
  );
}

import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { useAdminRealtime, type ConnectionState } from './admin-realtime';

const COPY: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  live: { label: 'Live', dot: 'bg-status-ready', text: 'text-status-ready' },
  connecting: { label: 'Connecting…', dot: 'bg-honey animate-pulse', text: 'text-honey' },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-honey animate-pulse', text: 'text-honey' },
  offline: { label: 'Offline', dot: 'bg-status-cancelled', text: 'text-status-cancelled' },
};

export function ConnectionIndicator() {
  const { connection, lastSyncedAt, refreshAll } = useAdminRealtime();
  const copy = COPY[connection];
  const synced = lastSyncedAt
    ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(
        lastSyncedAt,
      )
    : 'not yet';

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="status"
            aria-live="polite"
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-bold shadow-soft',
              copy.text,
            )}
          >
            <span className={cn('size-2 rounded-full', copy.dot)} aria-hidden="true" />
            {copy.label}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {connection === 'live'
            ? 'Receiving live order updates.'
            : 'Live updates paused — refreshing every 30 seconds.'}{' '}
          Last synced {synced}.
        </TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="icon-sm" onClick={refreshAll} aria-label="Refresh now">
        <RefreshCw className="size-4" />
      </Button>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';

import { fetchQueue } from '@/services/admin/orders';

export const queueQueryKey = ['admin', 'queue'] as const;

/** Paid, active orders plus those completed in the last 12 hours. Polls as a Realtime safety net. */
export function useAdminQueue(enabled = true) {
  return useQuery({
    queryKey: queueQueryKey,
    queryFn: () => fetchQueue(new Date(Date.now() - 12 * 3_600_000).toISOString()),
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
}

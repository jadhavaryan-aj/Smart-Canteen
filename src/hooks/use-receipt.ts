import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { supabaseConfig } from '@/lib/supabase/env';
import { fetchReceipt, subscribeToOrder } from '@/services/orders';
import { currentStudentId } from '@/services/student-session';
import type { OrderReceipt } from '@/types/domain';

function pollInterval(receipt: OrderReceipt | null | undefined, live: boolean): number | false {
  if (!receipt) return false;
  if (receipt.status === 'payment_pending') {
    const ageMs = Date.now() - new Date(receipt.createdAt).getTime();
    return ageMs < 5 * 60_000 ? 4_000 : 20_000;
  }
  if (receipt.status === 'completed' || receipt.status === 'cancelled') return false;
  // Realtime is a convenience; keep a slower poll as a safety net.
  return live ? 45_000 : 15_000;
}

/** Loads a receipt and keeps it current via Realtime (when signed in) plus polling. */
export function useReceipt(orderId: string, accessToken: string | null) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const queryKey = ['receipt', orderId] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => fetchReceipt(orderId, accessToken),
    enabled: supabaseConfig.isConfigured,
    refetchInterval: (q) => pollInterval(q.state.data, live),
    refetchOnWindowFocus: true,
  });

  const isOwner = query.data?.isOwner ?? false;
  const status = query.data?.status;
  const terminal = status === 'completed' || status === 'cancelled';

  useEffect(() => {
    if (!supabaseConfig.isConfigured || !isOwner || terminal) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void currentStudentId().then((userId) => {
      if (!userId || cancelled) return;
      unsubscribe = subscribeToOrder(
        orderId,
        () => void queryClient.invalidateQueries({ queryKey: ['receipt', orderId] }),
        (state) => setLive(state === 'live'),
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
      setLive(false);
    };
  }, [orderId, isOwner, terminal, queryClient]);

  return { ...query, live };
}

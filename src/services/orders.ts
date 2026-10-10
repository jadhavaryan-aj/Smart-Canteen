import type { RealtimeChannel } from '@supabase/supabase-js';

import { fromPostgrestError } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase/client';
import type { MyOrderSummary, OrderReceipt } from '@/types/domain';

import { mapMyOrder, mapReceipt } from './mappers';
import { currentStudentId } from './student-session';

/** The signed-in student's recent orders. RLS guarantees only their own rows are returned. */
export async function fetchMyOrders(limit = 30): Promise<MyOrderSummary[]> {
  const userId = await currentStudentId();
  if (!userId) return [];
  const { data, error } = await getSupabase()
    .from('orders')
    .select('id, order_number, status, payment_status, total_paise, item_count, created_at, paid_at, payment_expires_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw fromPostgrestError(error);
  return data.map(mapMyOrder);
}

/**
 * Loads a receipt. Authorised server-side for the order's owner, or for anyone
 * holding the order's secret receipt token. Returns null when not found or not
 * authorised (indistinguishable by design).
 */
export async function fetchReceipt(orderId: string, accessToken: string | null): Promise<OrderReceipt | null> {
  const { data, error } = await getSupabase().rpc('get_order_receipt', {
    p_order_id: orderId,
    p_access_token: accessToken,
  });
  if (error) throw fromPostgrestError(error);
  return data ? mapReceipt(data) : null;
}

/**
 * Subscribes to changes of one order. Realtime respects RLS, so students only
 * ever receive events for orders they own. Events are hints: callers re-fetch.
 */
export function subscribeToOrder(
  orderId: string,
  onChange: () => void,
  onStatus?: (status: 'live' | 'offline') => void,
): () => void {
  const client = getSupabase();
  const channel: RealtimeChannel = client
    .channel(`order:${orderId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, () =>
      onChange(),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onStatus?.('live');
        onChange(); // reconcile anything missed while connecting
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onStatus?.('offline');
      }
    });
  return () => {
    void client.removeChannel(channel);
  };
}

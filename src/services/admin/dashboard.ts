import { fromPostgrestError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/client';
import type { OrderStatus } from '@/types/domain';

import type { DashboardStats } from './types';

export async function fetchDashboardStats(day?: string): Promise<DashboardStats> {
  const { data, error } = await getAdminSupabase().rpc('get_dashboard_stats', { p_day: day ?? null });
  if (error) throw fromPostgrestError(error);
  const raw = (data ?? {}) as Record<string, unknown>;
  const num = (key: string) => Number(raw[key] ?? 0);
  const activity = Array.isArray(raw.recent_activity) ? (raw.recent_activity as Record<string, unknown>[]) : [];
  return {
    day: String(raw.day ?? ''),
    timezone: String(raw.timezone ?? 'Asia/Kolkata'),
    ordersToday: num('orders_today'),
    awaitingPreparation: num('awaiting_preparation'),
    preparing: num('preparing'),
    readyForPickup: num('ready_for_pickup'),
    completedToday: num('completed_today'),
    cancelledToday: num('cancelled_today'),
    grossRevenuePaise: num('gross_revenue_paise'),
    refundedPaise: num('refunded_paise'),
    netRevenuePaise: num('net_revenue_paise'),
    needsAttention: num('needs_attention'),
    recentActivity: activity.map((entry) => ({
      id: Number(entry.id),
      orderId: String(entry.order_id),
      orderNumber: String(entry.order_number),
      previousStatus: (entry.previous_status as OrderStatus | null) ?? null,
      newStatus: entry.new_status as OrderStatus,
      source: String(entry.source),
      at: String(entry.at),
      actor: (entry.actor as string | null) ?? null,
    })),
  };
}

import { fromPostgrestError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/client';
import type { Tables, TablesUpdate } from '@/lib/supabase/database.types';
import { mapOrderingStatus } from '@/services/mappers';
import type { OrderingStatus } from '@/types/domain';

export type AdminSettings = Tables<'canteen_settings'>;

export async function fetchAdminSettings(): Promise<AdminSettings> {
  const { data, error } = await getAdminSupabase().from('canteen_settings').select('*').eq('id', 1).single();
  if (error) throw fromPostgrestError(error);
  return data;
}

export async function updateSettings(patch: TablesUpdate<'canteen_settings'>): Promise<void> {
  const { data, error } = await getAdminSupabase().from('canteen_settings').update(patch).eq('id', 1).select('id');
  if (error) throw fromPostgrestError(error);
  if (!data || data.length === 0) {
    throw fromPostgrestError({ message: 'FORBIDDEN', hint: 'Only administrators can change settings.' });
  }
}

export async function fetchOrderingStatus(): Promise<OrderingStatus> {
  const { data, error } = await getAdminSupabase().rpc('get_ordering_status', {});
  if (error) throw fromPostgrestError(error);
  return mapOrderingStatus(data);
}

export async function setOrderingPaused(paused: boolean, message?: string): Promise<OrderingStatus> {
  const { data, error } = await getAdminSupabase().rpc('set_ordering_paused', {
    p_paused: paused,
    p_message: message ?? null,
  });
  if (error) throw fromPostgrestError(error);
  return mapOrderingStatus(data);
}

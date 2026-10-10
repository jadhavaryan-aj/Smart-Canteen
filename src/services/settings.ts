import { fromPostgrestError } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase/client';
import type { PublicSettings } from '@/types/domain';

import { mapPublicSettings } from './mappers';

export async function fetchPublicSettings(): Promise<PublicSettings> {
  const { data, error } = await getSupabase().rpc('get_public_settings');
  if (error) throw fromPostgrestError(error);
  return mapPublicSettings(data);
}

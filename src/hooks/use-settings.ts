import { useQuery } from '@tanstack/react-query';

import { supabaseConfig } from '@/lib/supabase/env';
import { fetchPublicSettings } from '@/services/settings';

export const settingsQueryKey = ['public-settings'] as const;

/** Public canteen settings and the live "is ordering open?" state. */
export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: fetchPublicSettings,
    enabled: supabaseConfig.isConfigured,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

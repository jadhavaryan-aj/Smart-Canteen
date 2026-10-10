import { useQuery } from '@tanstack/react-query';

import { supabaseConfig } from '@/lib/supabase/env';
import { fetchMenu } from '@/services/menu';

export const menuQueryKey = ['menu'] as const;

export function useMenu() {
  return useQuery({
    queryKey: menuQueryKey,
    queryFn: fetchMenu,
    enabled: supabaseConfig.isConfigured,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

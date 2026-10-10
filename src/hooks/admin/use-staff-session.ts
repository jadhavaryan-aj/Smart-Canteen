import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { getAdminSupabase } from '@/lib/supabase/client';
import { supabaseConfig } from '@/lib/supabase/env';
import { fetchStaffSession } from '@/services/admin/auth';

export const staffSessionKey = ['staff-session'] as const;

export function useStaffSession() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabaseConfig.isConfigured) return;
    const { data } = getAdminSupabase().auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') return;
      // Defer: Supabase recommends not calling its API inside this callback.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: staffSessionKey }), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: staffSessionKey,
    queryFn: fetchStaffSession,
    enabled: supabaseConfig.isConfigured,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

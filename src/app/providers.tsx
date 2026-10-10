import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useState, type ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppError } from '@/lib/errors';

const NON_RETRYABLE = new Set([
  'SUPABASE_NOT_CONFIGURED',
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'GUEST_AUTH_DISABLED',
]);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !(error instanceof AppError && NON_RETRYABLE.has(error.code)) && failureCount < 2,
        refetchOnWindowFocus: true,
      },
    },
  });
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      {/* Respect the operating system's reduced-motion preference everywhere. */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={250}>
          {children}
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}

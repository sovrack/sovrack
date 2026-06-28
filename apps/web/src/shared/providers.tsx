'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthSessionManager } from '@/features/auth/components/auth-session-manager';
import { ConfirmProvider } from '@/shared/contexts/confirm-context';
import { SidebarProvider } from '@/shared/contexts/sidebar-context';
import { ThemeProvider } from '@/shared/contexts/theme-context';
import { queryClient } from '@/shared/lib/query-client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthSessionManager>
          <ConfirmProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </ConfirmProvider>
        </AuthSessionManager>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

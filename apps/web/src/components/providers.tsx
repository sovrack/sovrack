'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthSessionManager } from '@/components/auth/auth-session-manager';
import { I18nProvider } from '@/contexts/i18n-context';
import { SidebarProvider } from '@/contexts/sidebar-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { queryClient } from '@/lib/query-client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthSessionManager>
            <SidebarProvider>{children}</SidebarProvider>
          </AuthSessionManager>
        </I18nProvider>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

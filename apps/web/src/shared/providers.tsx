"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AuthSessionManager } from "@/features/auth/components/auth-session-manager";
import { ConfirmProvider } from "@/shared/contexts/confirm-context";
import { ToastProvider } from "@/shared/contexts/toast-context";
import { SidebarProvider } from "@/shared/contexts/sidebar-context";
import { ThemeProvider } from "@/shared/contexts/theme-context";
import { queryClient } from "@/shared/lib/query-client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthSessionManager>
          <ConfirmProvider>
            <ToastProvider>
              <SidebarProvider>{children}</SidebarProvider>
            </ToastProvider>
          </ConfirmProvider>
        </AuthSessionManager>
      </ThemeProvider>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

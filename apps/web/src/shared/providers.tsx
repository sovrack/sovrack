"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AuthSessionManager } from "@/features/auth/components/auth-session-manager";
import { WorkspaceSessionManager } from "@/features/teams/components/workspace-session-manager";
import { ConfirmProvider } from "@/shared/contexts/confirm-context";
import { ToastProvider } from "@/shared/contexts/toast-context";
import { SidebarProvider } from "@/shared/contexts/sidebar-context";
import { LanguageProvider } from "@/shared/i18n/language-context";
import { queryClient } from "@/shared/lib/query-client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthSessionManager>
          <WorkspaceSessionManager>
            <ConfirmProvider>
              <ToastProvider>
                <SidebarProvider>{children}</SidebarProvider>
              </ToastProvider>
            </ConfirmProvider>
          </WorkspaceSessionManager>
        </AuthSessionManager>
      </LanguageProvider>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

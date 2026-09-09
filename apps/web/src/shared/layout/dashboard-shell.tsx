"use client";

import { Sidebar } from "@/shared/layout/sidebar";
import { TopNav } from "@/shared/layout/top-nav";
import { useSidebar } from "@/shared/contexts/sidebar-context";
import { PRODUCT_STAGE } from "@/shared/config/product-capabilities";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import api from "@/shared/lib/api";
import { useAuth } from "@/features/auth/api/use-auth";

type AuthSessionMetadata = {
  authenticationType: "user" | "staff-impersonation";
  expiresAt: string | null;
};

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const router = useRouter();
  const { logout } = useAuth();
  const { data: session } = useQuery({
    queryKey: ["auth-session-metadata"],
    queryFn: async () => {
      const response = await api.get<AuthSessionMetadata>("/auth/session");
      return response.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const leaveAssistanceSession = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
      <Sidebar />
      <div
        className="flex flex-1 flex-col transition-all duration-300 ease-in-out"
        style={{ marginLeft: collapsed ? "80px" : "256px" }}
      >
        <TopNav />
        <main className="flex-1 px-4 py-5 md:px-6 md:py-6">
          <div className="mx-auto max-w-[1600px]">
            {session?.authenticationType === "staff-impersonation" && (
              <div
                role="alert"
                className="mb-5 flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between dark:text-red-200"
              >
                <span className="flex items-center gap-2">
                  <ShieldAlert size={18} aria-hidden="true" />
                  Session d’assistance staff active en lecture seule.
                  L’ouverture et son motif sont journalisés.
                </span>
                <button
                  type="button"
                  onClick={() => void leaveAssistanceSession()}
                  className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 font-semibold transition hover:bg-red-500/15"
                >
                  Quitter la session
                </button>
              </div>
            )}
            {PRODUCT_STAGE === "private-development" && (
              <div
                role="status"
                className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-600 dark:text-amber-300"
              >
                Développement privé — cet espace et ses actions sont réservés
                aux tests contrôlés.
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

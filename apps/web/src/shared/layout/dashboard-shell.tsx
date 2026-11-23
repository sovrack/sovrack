"use client";

import { Sidebar } from "@/shared/layout/sidebar";
import { TopNav } from "@/shared/layout/top-nav";
import { useSidebar } from "@/shared/contexts/sidebar-context";
import { useTheme } from "@/shared/contexts/theme-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import api from "@/shared/lib/api";
import { useAuth } from "@/features/auth/api/use-auth";
import clsx from "clsx";

type AuthSessionMetadata = {
  authenticationType: "user" | "staff-impersonation";
  expiresAt: string | null;
};

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const { isLight } = useTheme();
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
    <div className="flex min-h-screen bg-[#121212]">
      <Sidebar />
      <div
        className={clsx(
          "flex min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out",
          collapsed ? "lg:ml-16" : "lg:ml-[254px]",
          isLight
            ? "dashboard-light bg-[#f8fafc] text-slate-900"
            : "bg-[#0a0a0a] text-zinc-100",
        )}
      >
        <TopNav />
        <main className="flex-1 px-4 py-5 md:px-6 md:py-6">
          <div className="mx-auto max-w-[1600px]">
            {session?.authenticationType === "staff-impersonation" && (
              <div
                role="alert"
                className="mb-5 flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"
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
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

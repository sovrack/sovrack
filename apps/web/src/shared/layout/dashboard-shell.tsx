"use client";

import { Sidebar } from "@/shared/layout/sidebar";
import { TopNav } from "@/shared/layout/top-nav";
import { useSidebar } from "@/shared/contexts/sidebar-context";
import { PRODUCT_STAGE } from "@/shared/config/product-capabilities";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

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

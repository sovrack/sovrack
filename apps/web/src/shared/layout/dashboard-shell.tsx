"use client";

import { Sidebar } from "@/shared/layout/sidebar";
import { TopNav } from "@/shared/layout/top-nav";
import { useSidebar } from "@/shared/contexts/sidebar-context";

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
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

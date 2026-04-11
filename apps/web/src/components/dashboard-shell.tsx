'use client';

import clsx from 'clsx';
import { Sidebar } from '@/components/sidebar';
import { TopNav } from '@/components/top-nav';
import { Backdrop } from '@/components/backdrop';
import { useSidebar } from '@/contexts/sidebar-context';

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  const mainContentMargin =
    isExpanded || isHovered || isMobileOpen ? 'lg:ml-[290px]' : 'lg:ml-[92px]';

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />
      <Backdrop />
      <div
        className={clsx(
          'min-h-screen transition-all duration-300 ease-in-out',
          mainContentMargin,
        )}
      >
        <TopNav />
        <main className="px-4 py-4 md:px-6 md:py-6">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

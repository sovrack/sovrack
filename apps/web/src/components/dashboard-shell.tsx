'use client';

import clsx from 'clsx';
import { Sidebar } from '@/components/sidebar';
import { TopNav } from '@/components/top-nav';
import { Backdrop } from '@/components/backdrop';
import { SIDEBAR_CLASSES } from '@/config/layout';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  // Sidebar toujours visible - pas de toggle/collapse
  const mainContentMargin = SIDEBAR_CLASSES.contentExpanded;

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
      <Sidebar />
      <Backdrop />
      <div
        className={clsx(
          'min-h-screen',
          mainContentMargin,
        )}
      >
        <TopNav />
        <main className="px-4 py-5 md:px-6 md:py-6">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

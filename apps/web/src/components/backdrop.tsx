'use client';

import { useSidebar } from '@/contexts/sidebar-context';

export function Backdrop() {
  const { isMobileOpen, closeMobileSidebar } = useSidebar();

  if (!isMobileOpen) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label="Close sidebar"
      onClick={closeMobileSidebar}
      className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
    />
  );
}

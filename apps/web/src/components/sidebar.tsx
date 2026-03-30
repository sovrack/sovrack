'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/deployments', label: 'Deployments' },
  { href: '/profile', label: 'Profile' },
];

const adminItems = [{ href: '/admin/servers', label: 'Admin • Servers' }];

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  const allItems = isAdmin ? [...navItems, ...adminItems] : navItems;

  return (
    <aside className="w-full border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
      <div className="mb-5 hidden lg:block">
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Control Panel</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">DevOps Platform</h1>
        <p className="mt-1 text-sm text-slate-500">Sprint 2 • Dashboard UX</p>
      </div>

      <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
        {allItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-slate-900 text-white shadow'
                  : 'text-slate-700 hover:bg-slate-100',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

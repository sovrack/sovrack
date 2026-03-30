'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/deployments', label: 'Deployments' },
  { href: '/profile', label: 'Profile' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full border-b border-slate-200 bg-white px-4 py-3 lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
      <div className="mb-4 hidden lg:block">
        <h1 className="text-xl font-bold text-slate-900">DevOps Platform</h1>
        <p className="text-sm text-slate-500">Sprint 2 Dashboard</p>
      </div>

      <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-blue-600 text-white'
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

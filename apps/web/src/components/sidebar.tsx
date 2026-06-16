'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useAuth } from '@/hooks/auth/use-auth';
import { useSidebar } from '@/contexts/sidebar-context';
import { LogOut, Rocket, Settings } from 'lucide-react';
import { APP_NAV_SECTIONS, isRouteActive } from '@/config/navigation';

type NavItemProps = {
  href: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  collapsed: boolean;
};

function NavItem({ href, label, icon: Icon, isActive, collapsed }: NavItemProps) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={clsx(
        'group flex items-center gap-3 rounded-md py-2 text-[15px] transition-colors duration-150',
        collapsed ? 'justify-center px-0' : 'px-3',
        isActive
          ? 'bg-zinc-100 font-medium text-zinc-900 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-800'
          : 'font-normal text-zinc-700 hover:bg-zinc-100/80 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100',
      )}
    >
      <Icon
        className={clsx(
          'h-5 w-5 shrink-0 transition-colors',
          isActive
            ? 'text-zinc-900 dark:text-white'
            : 'text-zinc-700 group-hover:text-zinc-900 dark:text-zinc-200 dark:group-hover:text-zinc-100',
        )}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-1 mt-5 px-3 text-xs font-medium uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
      {label}
    </p>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();
  const { collapsed } = useSidebar();

  const initials = user?.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-zinc-200 bg-white transition-all duration-300 ease-in-out dark:border-zinc-800 dark:bg-zinc-900',
        collapsed ? 'w-20' : 'w-64',
      )}
    >
      {/* Logo */}
      <div className={clsx('shrink-0 py-4', collapsed ? 'px-2' : 'px-3')}>
        <Link
          href="/dashboard"
          className={clsx('flex w-full items-center gap-2', collapsed && 'justify-center')}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">
            <Rocket className="h-6 w-6" />
          </div>
          {!collapsed && (
            <span className="truncate text-[17px] font-semibold text-zinc-900 dark:text-white">
              platform
            </span>
          )}
        </Link>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 no-scrollbar">
        {APP_NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) =>
            item.adminOnly ? isAdmin : true,
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.id}>
              {!collapsed && (
                <SectionLabel label={section.label} />
              )}
              <nav className="space-y-0.5">
                {visibleItems.map((item) => {
                  return (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      isActive={isRouteActive(pathname, item.href)}
                      collapsed={collapsed}
                    />
                  );
                })}
              </nav>
            </div>
          );
        })}
      </div>

      {/* User card — click to go to platform settings */}
      <div className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div
          className={clsx(
            'flex items-center rounded-xl border border-zinc-200 bg-white transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60',
            collapsed ? 'justify-center py-2.5 px-0' : 'gap-3 py-2.5 px-3',
          )}
        >
          <Link
            href="/settings"
            title={collapsed ? 'Platform Settings' : undefined}
            className={clsx('flex items-center gap-3 min-w-0 flex-1', collapsed && 'justify-center')}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-bold text-zinc-50 dark:bg-zinc-800 dark:text-zinc-50">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-zinc-700 dark:text-zinc-200">
                  {user?.fullName ?? 'User'}
                </p>
                <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-500">
                  {user?.role ?? 'DEVELOPER'}
                </p>
              </div>
            )}
          </Link>

          {!collapsed && (
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/settings"
                title="Platform settings"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-50"
              >
                <Settings size={14} />
              </Link>
              <button
                onClick={logout}
                title="Logout"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-50"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

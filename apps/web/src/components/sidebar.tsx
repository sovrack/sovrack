'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard,
  FolderGit2,
  Rocket,
  User,
  Server,
  Activity,
  ChevronRight,
  LogOut,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderGit2 },
  { href: '/deployments', label: 'Deployments', icon: Rocket },
  { href: '/profile', label: 'Profile', icon: User },
];

const adminItems = [{ href: '/admin/servers', label: 'Servers', icon: Server }];

type NavItemProps = {
  href: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
};

function NavItem({ href, label, icon: Icon, isActive }: NavItemProps) {
  return (
    <Link
      href={href}
      className={clsx(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-white/10 text-white shadow-sm'
          : 'text-slate-400 hover:bg-white/5 hover:text-white',
      )}
    >
      <Icon
        size={18}
        className={clsx(
          'shrink-0 transition-colors',
          isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300',
        )}
      />
      <span className="truncate">{label}</span>
      {isActive && (
        <ChevronRight size={14} className="ml-auto shrink-0 text-slate-400" />
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:min-h-screen bg-slate-900 border-r border-slate-800">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 shadow">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">DevOps Platform</p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-slate-500">
              Control Panel
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">
            Menu
          </p>
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              isActive={pathname === item.href}
            />
          ))}

          {isAdmin && (
            <>
              <div className="my-4 border-t border-slate-800" />
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                Administration
              </p>
              {adminItems.map((item) => (
                <NavItem
                  key={item.href}
                  {...item}
                  isActive={pathname === item.href}
                />
              ))}
            </>
          )}
        </nav>

        {/* User card at bottom */}
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white leading-none">
                {user?.fullName ?? 'User'}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {user?.role ?? 'DEVELOPER'}
              </p>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500">
            <Activity size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-900">DevOps Platform</span>
        </div>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center justify-center rounded-lg p-2 transition',
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100',
                )}
                title={item.label}
              >
                <Icon size={17} />
              </Link>
            );
          })}
          {isAdmin &&
            adminItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'flex items-center justify-center rounded-lg p-2 transition',
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:bg-slate-100',
                  )}
                  title={item.label}
                >
                  <Icon size={17} />
                </Link>
              );
            })}
        </nav>
      </div>
    </>
  );
}

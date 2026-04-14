'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useAuth } from '@/hooks/useAuth';
import { useSidebar } from '@/contexts/sidebar-context';
import {
  LayoutDashboard,
  FolderGit2,
  Rocket,
  User,
  Users,
  Server,
  SquarePlus,
  Settings,
  ChevronRight,
  LogOut,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderGit2 },
  { href: '/deployments', label: 'Deployments', icon: Rocket },
  { href: '/profile', label: 'Profile', icon: User },
];

const adminItems = [
  { href: '/projects/new', label: 'New Project', icon: SquarePlus },
  { href: '/admin/users', label: 'Utilisateurs', icon: Users },
  { href: '/admin/servers', label: 'Servers', icon: Server },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

type NavItemProps = {
  href: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  isCompact: boolean;
};

function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
  isCompact,
}: NavItemProps) {
  return (
    <Link
      href={href}
      className={clsx(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-950/60 dark:text-brand-300'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white',
        isCompact ? 'justify-center lg:px-2.5' : 'justify-start',
      )}
    >
      <Icon
        size={18}
        className={clsx(
          'shrink-0 transition-colors',
          isActive
            ? 'text-brand-600 dark:text-brand-300'
            : 'text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200',
        )}
      />
      {!isCompact && <span className="truncate">{label}</span>}
      {isActive && !isCompact && (
        <ChevronRight size={14} className="ml-auto shrink-0 text-slate-400" />
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();
  const { isExpanded, isHovered, isMobileOpen, setIsHovered, closeMobileSidebar } =
    useSidebar();

  const isCompact = !isExpanded && !isHovered && !isMobileOpen;

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-950',
        isCompact ? 'w-[92px]' : 'w-[290px]',
        isMobileOpen
          ? 'translate-x-0 shadow-2xl'
          : '-translate-x-full lg:translate-x-0',
      )}
      onMouseEnter={() => {
        if (!isExpanded) {
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={clsx(
          'flex h-[88px] items-center border-b border-gray-200 dark:border-slate-800',
          isCompact ? 'justify-center px-3' : 'justify-between px-5',
        )}
      >
        <Link
          href="/dashboard"
          className={clsx('flex items-center', isCompact ? 'justify-center' : 'gap-3')}
          onClick={closeMobileSidebar}
        >
          {isCompact ? (
            <Image
              src="/platform-mark.svg"
              alt="platform"
              width={34}
              height={34}
              priority
            />
          ) : (
            <Image
              src="/platform-brand.svg"
              alt="platform"
              width={146}
              height={42}
              priority
            />
          )}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 no-scrollbar">
        <div>
          <p
            className={clsx(
              'mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500',
              isCompact && 'text-center',
            )}
          >
            {isCompact ? '...' : 'Menu'}
          </p>

          <nav className="space-y-1.5">
            {navItems.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                isActive={isActive(item.href)}
                isCompact={isCompact}
              />
            ))}
          </nav>
        </div>

        {isAdmin && (
          <div className="mt-6">
            <div className="my-4 border-t border-gray-200 dark:border-slate-800" />
            <p
              className={clsx(
                'mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500',
                isCompact && 'text-center',
              )}
            >
              {isCompact ? 'A' : 'Administration'}
            </p>

            <nav className="space-y-1.5">
              {adminItems.map((item) => (
                <NavItem
                  key={item.href}
                  {...item}
                  isActive={isActive(item.href)}
                  isCompact={isCompact}
                />
              ))}
            </nav>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 p-4 dark:border-slate-800">
        <div
          className={clsx(
            'flex items-center rounded-2xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900',
            isCompact ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-3',
          )}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
            {initials}
          </div>

          {!isCompact && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {user?.fullName ?? 'User'}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {user?.role ?? 'DEVELOPER'}
                </p>
              </div>

              <button
                onClick={logout}
                title="Logout"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

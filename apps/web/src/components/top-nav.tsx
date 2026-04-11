'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSidebar } from '@/contexts/sidebar-context';
import {
  Bell,
  ChevronDown,
  LogOut,
  User,
  Menu,
  X,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';

export function TopNav() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    router.push('/auth/login/developer');
  };

  const handleSidebarToggle = () => {
    if (window.innerWidth >= 1024) {
      toggleSidebar();
      return;
    }

    toggleMobileSidebar();
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
      <div className="flex flex-col px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={handleSidebarToggle}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
              aria-label="Toggle sidebar"
            >
              {isMobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <div className="flex items-center gap-2">
              <Image
                src="/platform-brand.svg"
                alt="platform"
                width={118}
                height={34}
                priority
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            <button className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white">
              <Bell size={18} />
              <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand-500" />
            </button>

            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-900"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                  {initials}
                </div>
                <div className="hidden text-left md:block">
                  <p className="max-w-[160px] truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {user?.fullName ?? 'User'}
                  </p>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {user?.role ?? 'DEVELOPER'}
                  </p>
                </div>
                <ChevronDown size={16} className="hidden text-slate-400 md:block" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-3 w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-800">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {user?.fullName}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {user?.email}
                    </p>
                  </div>

                  <div className="mt-2 space-y-1">
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        router.push('/profile');
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <User size={15} className="text-slate-400" />
                      Profile
                    </button>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
                    >
                      <LogOut size={15} className="text-red-400" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

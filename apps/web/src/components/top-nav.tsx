'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSidebar } from '@/contexts/sidebar-context';
import { ThemeToggle } from '@/components/theme-toggle';
import { Bell, ChevronDown, LogOut, User, Menu } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function TopNav() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { toggleSidebar } = useSidebar();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initials = user?.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    router.push('/login');
  };

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
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-app)]/90 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <button
          onClick={toggleSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <Menu size={18} strokeWidth={2} />
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />

          <button className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]">
            <Bell size={17} />
            <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
          </button>

          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-sm transition hover:bg-[var(--hover)]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--text-primary)] text-[11px] font-bold text-[var(--bg-app)]">
                {initials}
              </div>
              <div className="hidden text-left md:block">
                <p className="max-w-[140px] truncate text-sm font-semibold text-[var(--text-primary)]">
                  {user?.fullName ?? 'User'}
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  {user?.role ?? 'DEVELOPER'}
                </p>
              </div>
              <ChevronDown size={14} className="hidden text-[var(--text-muted)] md:block" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-2xl">
                <div className="rounded-lg bg-[var(--hover)] px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {user?.fullName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    {user?.email}
                  </p>
                </div>

                <div className="mt-1.5 space-y-0.5">
                  <button
                    onClick={() => { setDropdownOpen(false); router.push('/profile'); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                  >
                    <User size={14} className="text-[var(--text-muted)]" />
                    Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/10 hover:text-red-400"
                  >
                    <LogOut size={14} className="text-red-400" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

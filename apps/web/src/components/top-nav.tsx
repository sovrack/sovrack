'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Bell, Search, ChevronDown, LogOut, User } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function TopNav() {
  const router = useRouter();
  const { user, logout } = useAuth();
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm lg:px-6">
      {/* Search */}
      <div className="hidden flex-1 sm:flex">
        <div className="relative w-full max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search projects, deployments..."
            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm text-slate-700 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Notification bell */}
        <button className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100">
          <Bell size={18} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500" />
        </button>

        {/* User dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-2 pr-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
              {initials}
            </div>
            <span className="hidden max-w-[120px] truncate sm:block">
              {user?.fullName ?? 'User'}
            </span>
            <span className="hidden rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:block">
              {user?.role ?? 'DEV'}
            </span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <div className="border-b border-slate-100 px-4 py-2.5">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {user?.fullName}
                </p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  router.push('/profile');
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <User size={15} className="text-slate-400" />
                Profile
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50"
              >
                <LogOut size={15} className="text-red-400" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

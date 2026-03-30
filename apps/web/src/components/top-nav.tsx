'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export function TopNav() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  return (
    <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Workspace</p>
          <h2 className="text-lg font-semibold text-slate-900">Developer Console</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-slate-900">{user?.name ?? 'User'}</p>
            <p className="text-xs text-slate-500">{user?.email ?? 'workspace@local'}</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            {user?.role ?? 'DEVELOPER'}
          </span>
          <button
            onClick={handleLogout}
            className="rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

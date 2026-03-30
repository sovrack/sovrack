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
    <header className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Workspace</p>
          <h2 className="text-lg font-semibold text-slate-900">Developer Console</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-slate-900">{user?.name ?? 'User'}</p>
            <p className="text-xs text-slate-500">{user?.role ?? 'DEVELOPER'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

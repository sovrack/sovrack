'use client';

import { useAuth } from '@/hooks/useAuth';
import { StatsCard } from '@/components/stats-card';
import { useDashboardStats } from '@/hooks/useDashboardStats';

export default function DashboardPage() {
  const { user } = useAuth();
  const { stats, loading, refresh } = useDashboardStats();

  const progressItems = [
    { label: 'Sprint 1 - Auth', progress: 100, state: 'done' },
    { label: 'Sprint 2 - Dashboard', progress: 80, state: 'in progress' },
    { label: 'Sprint 3 - Projects', progress: 0, state: 'upcoming' },
    { label: 'Sprint 4 - Deployments', progress: 0, state: 'upcoming' },
    { label: 'Sprint 5 - WebSocket Logs', progress: 0, state: 'upcoming' },
  ] as const;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user?.name ?? 'Developer'}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Centralize your delivery metrics and track the platform rollout sprint by sprint.
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Refresh Stats
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatsCard
          title="Projects"
          value={loading ? '...' : stats.projects}
          hint="Total projects you can access"
        />
        <StatsCard
          title="Deployments"
          value={loading ? '...' : stats.deployments}
          hint="Total deployment records"
        />
        <StatsCard
          title="Servers"
          value={loading ? '...' : stats.servers}
          hint={user?.role === 'ADMIN' ? 'Visible for admins' : 'Admin only'}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Frontend Delivery Progress</h2>
        <div className="mt-4 space-y-4">
          {progressItems.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="text-xs uppercase text-slate-500">{item.state}</p>
              </div>
              <div className="h-2 rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
        <h3 className="text-base font-semibold text-slate-900">Next Sprint Focus</h3>
        <p className="mt-2 text-sm text-slate-600">
          Sprint 3 adds full project management UI, member administration, and GitLab setup flows.
        </p>
      </section>
    </div>
  );
}

'use client';

import { useAuth } from '@/hooks/useAuth';
import { StatsCard } from '@/components/stats-card';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { DeploymentsChart } from '@/components/dashboard/deployments-chart';
import { SuccessGauge } from '@/components/dashboard/success-gauge';
import { RecentDeployments } from '@/components/dashboard/recent-deployments';
import {
  FolderGit2,
  Rocket,
  Server,
  CheckCircle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { stats, recentDeployments, deploymentsChart, loading, refresh } =
    useDashboardStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Welcome back
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {user?.fullName ?? 'Developer'} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Here&apos;s what&apos;s happening with your platform today.
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Projects"
          value={loading ? '–' : stats.projects}
          hint="Accessible projects"
          tone="brand"
          icon={FolderGit2}
          trend={stats.projects > 0 ? { value: 12, direction: 'up' } : undefined}
        />
        <StatsCard
          title="Deployments"
          value={loading ? '–' : stats.deployments}
          hint="Total deployment records"
          tone="purple"
          icon={Rocket}
          trend={
            stats.deployments > 0 ? { value: 8, direction: 'up' } : undefined
          }
        />
        <StatsCard
          title="Servers"
          value={loading ? '–' : stats.servers}
          hint={isAdmin ? 'Registered VPS' : 'Admin only'}
          tone="accent"
          icon={Server}
        />
        <StatsCard
          title="Success Rate"
          value={loading ? '–' : `${stats.successRate}%`}
          hint="Deployments succeeded"
          tone="ok"
          icon={CheckCircle}
          trend={
            stats.successRate > 0
              ? {
                  value: stats.successRate >= 80 ? 5 : 0,
                  direction: stats.successRate >= 80 ? 'up' : 'down',
                }
              : undefined
          }
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Deployments bar chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Deployments — Last 7 Days
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Total vs successful deploys per day
              </p>
            </div>
            <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600">
              This week
            </span>
          </div>
          <DeploymentsChart data={deploymentsChart} />
        </div>

        {/* Success gauge */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Overall Success</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Ratio of successful deployments
            </p>
          </div>
          <div className="flex items-center justify-center py-2">
            <SuccessGauge
              percentage={loading ? 0 : stats.successRate}
              label="Success Rate"
            />
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Total Deployments</span>
              <span className="font-semibold text-slate-900">
                {stats.deployments}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Projects Active</span>
              <span className="font-semibold text-slate-900">{stats.projects}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent deployments + Quick actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent deployments */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Deployments
            </h2>
            <Link
              href="/deployments"
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <RecentDeployments
            deployments={recentDeployments}
            loading={loading}
          />
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            Quick Actions
          </h2>
          <div className="space-y-2">
            <Link
              href="/projects/new"
              className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm transition hover:border-indigo-200 hover:bg-indigo-50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
                <FolderGit2 size={16} className="text-indigo-500" />
              </div>
              <div>
                <p className="font-medium text-slate-800">New Project</p>
                <p className="text-xs text-slate-400">Connect a GitLab repo</p>
              </div>
            </Link>

            <Link
              href="/deployments"
              className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm transition hover:border-purple-200 hover:bg-purple-50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
                <Rocket size={16} className="text-purple-500" />
              </div>
              <div>
                <p className="font-medium text-slate-800">New Deployment</p>
                <p className="text-xs text-slate-400">Deploy a branch now</p>
              </div>
            </Link>

            {isAdmin && (
              <Link
                href="/admin/servers"
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm transition hover:border-orange-200 hover:bg-orange-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50">
                  <Server size={16} className="text-orange-500" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">Add Server</p>
                  <p className="text-xs text-slate-400">Register a new VPS</p>
                </div>
              </Link>
            )}
          </div>

          {/* Sprint progress */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Platform Progress
            </p>
            {[
              { label: 'Backend', pct: 100 },
              { label: 'Auth & Login', pct: 100 },
              { label: 'Dashboard', pct: 100 },
              { label: 'Projects', pct: 0 },
              { label: 'Deployments', pct: 0 },
            ].map((item) => (
              <div key={item.label} className="mb-2">
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="font-medium text-slate-700">{item.pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

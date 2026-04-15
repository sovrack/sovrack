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
  Shield,
  Activity,
  GitBranch,
  Users,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';

function toPercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { stats, recentDeployments, deploymentsChart, loading, error, refresh } =
    useDashboardStats();

  const totalServers = typeof stats.servers === 'number' ? stats.servers : 0;
  const verifiedServers =
    typeof stats.verifiedServers === 'number' ? stats.verifiedServers : 0;
  const serverVerificationRate = toPercent(verifiedServers, totalServers);
  const gitlabConnectionRate = toPercent(
    stats.gitlabConnectedProjects,
    stats.projects,
  );
  const readyProjectsRate = toPercent(stats.readyProjects, stats.projects);

  const platformProgressItems = [
    {
      label: 'Projets connectés GitLab',
      pct: gitlabConnectionRate,
      detail: `${stats.gitlabConnectedProjects}/${stats.projects}`,
    },
    {
      label: 'Projets prêts à déployer',
      pct: readyProjectsRate,
      detail: `${stats.readyProjects}/${stats.projects}`,
    },
    {
      label: 'Serveurs vérifiés',
      pct: isAdmin ? serverVerificationRate : 0,
      detail: isAdmin ? `${verifiedServers}/${totalServers}` : 'N/A (admin)',
    },
    {
      label: 'Déploiements réussis',
      pct: stats.successRate,
      detail: `${stats.successRate}%`,
    },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <section className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-theme-xs">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="px-6 py-7 md:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-600">
              Operations Center
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-900 md:text-4xl">
              {user?.fullName ?? 'Developer'}, welcome back.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              Pilot your projects, monitor deployment activity and keep the
              platform healthy from one shared workspace inspired by TailAdmin.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => void refresh()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                Refresh dashboard
              </button>
              <Link
                href="/deployments"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Open deployments
                <ArrowRight size={15} />
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700">
                <Shield size={14} />
                {isAdmin ? 'Administrator workspace' : 'Developer workspace'}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                <Activity size={14} />
                API + dashboard connected
              </span>
            </div>
          </div>

          <div className="border-t border-gray-200 bg-slate-50/70 px-6 py-7 md:px-8 xl:border-l xl:border-t-0">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Current role
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                  {isAdmin ? 'Admin Control' : 'Developer Control'}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {isAdmin
                    ? 'Manage servers and infrastructure settings.'
                    : 'Choose a project, a branch and an environment to deploy.'}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Current focus
                </p>
                <div className="mt-3 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <GitBranch size={15} className="text-brand-500" />
                    <span>Projects connected to GitLab</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Rocket size={15} className="text-brand-500" />
                    <span>Deployments visible in one flow</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Server size={15} className="text-brand-500" />
                    <span>Servers reserved to admin operations</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
          isAdmin ? 'xl:grid-cols-6' : 'xl:grid-cols-4'
        }`}
      >
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
        {isAdmin && (
          <StatsCard
            title="Utilisateurs"
            value={loading ? '–' : stats.usersTotal}
            hint="Comptes enregistrés"
            tone="brand"
            icon={Users}
          />
        )}
        {isAdmin && (
          <StatsCard
            title="Devs Actifs"
            value={loading ? '–' : stats.activeDevelopers}
            hint="Développeurs actifs"
            tone="ok"
            icon={UserCheck}
          />
        )}
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,0.95fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 shadow-theme-xs sm:px-6 sm:pt-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
                Deployment activity
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Total deployments versus successful runs over the last 7 days.
              </p>
            </div>
            <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
              This week
            </span>
          </div>
          <DeploymentsChart data={deploymentsChart} />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs">
          <div className="mb-5">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
              Success overview
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Instant health indicator for completed deployments.
            </p>
          </div>

          <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-slate-50 py-5">
            <SuccessGauge
              percentage={loading ? 0 : stats.successRate}
              label="Success Rate"
            />
          </div>

          <div className="mt-5 space-y-3 border-t border-gray-200 pt-5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Deployments</span>
              <span className="font-semibold text-slate-900">
                {stats.deployments}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Projects Active</span>
              <span className="font-semibold text-slate-900">{stats.projects}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Visible Servers</span>
              <span className="font-semibold text-slate-900">{stats.servers}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
              Recent Deployments
            </h2>
            <Link
              href="/deployments"
              className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              View deployments <ArrowRight size={12} />
            </Link>
          </div>
          <RecentDeployments
            deployments={recentDeployments}
            loading={loading}
          />
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs">
            <h2 className="mb-4 text-lg font-semibold tracking-[-0.02em] text-slate-900">
              Quick Actions
            </h2>
            <div className="space-y-3">
              {isAdmin && (
                <Link
                  href="/projects/new"
                  className="flex items-center gap-3 rounded-2xl border border-gray-200 p-4 text-sm transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50">
                    <FolderGit2 size={18} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">New Project</p>
                    <p className="text-xs text-slate-500">Connect a GitLab repository</p>
                  </div>
                </Link>
              )}

              <Link
                href="/deployments"
                className="flex items-center gap-3 rounded-2xl border border-gray-200 p-4 text-sm transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50">
                  <Rocket size={18} className="text-brand-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">New Deployment</p>
                  <p className="text-xs text-slate-500">Launch a deployment flow</p>
                </div>
              </Link>

              {isAdmin && (
                <Link
                  href="/admin/servers"
                  className="flex items-center gap-3 rounded-2xl border border-gray-200 p-4 text-sm transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50">
                    <Server size={18} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Manage Servers</p>
                    <p className="text-xs text-slate-500">
                      Register and verify a target machine
                    </p>
                  </div>
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/admin/users"
                  className="flex items-center gap-3 rounded-2xl border border-gray-200 p-4 text-sm transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50">
                    <Users size={18} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Gérer les utilisateurs</p>
                    <p className="text-xs text-slate-500">
                      Activer, modifier ou supprimer un compte
                    </p>
                  </div>
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs">
            <h2 className="mb-4 text-lg font-semibold tracking-[-0.02em] text-slate-900">
              Platform Progress
            </h2>
            {platformProgressItems.map((item) => (
              <div key={item.label} className="mb-4 last:mb-0">
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="font-medium text-slate-700">
                    {item.detail}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-brand-500 transition-all"
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

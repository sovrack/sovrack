'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  GitMerge,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/auth/use-auth';
import { getApiErrorMessage } from '@/lib/api';
import { dashboardService } from '@/services/dashboard.service';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { ServerHealthCard } from '@/components/dashboard/ServerHealthCard';
import { TopProjectsCard } from '@/components/dashboard/TopProjectsCard';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';

function formatRelative(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

type KpiCardProps = {
  title: string;
  value: string | number;
  subtitle: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'error' | 'warning';
};

function KpiCard({ title, value, subtitle, icon, tone = 'default' }: KpiCardProps) {
  const valueColor =
    tone === 'success'
      ? 'text-emerald-400'
      : tone === 'error'
        ? 'text-red-400'
        : tone === 'warning'
          ? 'text-amber-400'
          : 'text-[var(--text-primary)]';

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        {icon}
        {title}
      </p>
      <p className={`mt-3 text-4xl font-semibold leading-none ${valueColor}`}>
        {value}
      </p>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">{subtitle}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard-stats-v2'],
    queryFn: () => dashboardService.getStats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const queryError = error ? getApiErrorMessage(error) : null;

  const kpis = data?.kpis;
  const successRateTone =
    kpis && kpis.successRate7d >= 80
      ? 'success'
      : kpis && kpis.successRate7d >= 50
        ? 'warning'
        : kpis && kpis.deploymentsLast7d > 0
          ? 'error'
          : 'default';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Home"
        title={`Bonjour, ${user?.fullName ?? 'Admin'}`}
        description="Vue d'ensemble des projets et de l'activité de déploiement."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] disabled:opacity-50"
              aria-label="Rafraîchir"
            >
              <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
            </button>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90"
            >
              Projets <ArrowRight size={14} />
            </Link>
          </div>
        }
      />

      {queryError && (
        <Alert tone="error" title="Impossible de charger les données">
          {queryError}
        </Alert>
      )}

      {/* Alerts banners */}
      {kpis && kpis.runningCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <Zap size={15} className="shrink-0 text-blue-400 animate-pulse" />
          <p className="text-sm text-[var(--text-secondary)]">
            <span className="font-semibold text-blue-400">
              {kpis.runningCount} déploiement{kpis.runningCount > 1 ? 's' : ''} en cours
            </span>{' '}
            —{' '}
            <Link href="/deployments" className="underline hover:text-[var(--text-primary)]">
              Surveiller
            </Link>
          </p>
        </div>
      )}
      {data && data.recentFailures.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-400" />
          <div className="text-sm text-[var(--text-secondary)]">
            <span className="font-semibold text-red-400">
              {data.recentFailures.length} échec{data.recentFailures.length > 1 ? 's' : ''} récent{data.recentFailures.length > 1 ? 's' : ''}
            </span>{' '}
            — {data.recentFailures[0].projectName} · {data.recentFailures[0].environmentName} ·{' '}
            {formatRelative(data.recentFailures[0].createdAt)}{' '}
            <Link
              href={`/deployments/${data.recentFailures[0].id}`}
              className="underline hover:text-[var(--text-primary)]"
            >
              voir
            </Link>
          </div>
        </div>
      )}

      {/* Quick actions (admin) */}
      {isAdmin && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Nouveau projet', icon: <Plus size={15} />, href: '/projects?dialog=create-project', primary: true },
            { label: 'Déployer', icon: <Rocket size={15} />, href: '/deployments?dialog=create-deployment', primary: false },
            { label: 'Pipelines', icon: <GitMerge size={15} />, href: '/pipelines', primary: false },
            { label: 'Serveurs', icon: <Server size={15} />, href: '/admin/servers', primary: false },
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:opacity-90 ${
                action.primary
                  ? 'bg-[var(--text-primary)] text-[var(--bg-app)]'
                  : 'border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]'
              }`}
            >
              {action.icon}
              {action.label}
            </Link>
          ))}
        </div>
      )}

      {/* KPI row */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-[var(--hover)]" />
          ))}
        </div>
      ) : kpis ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            title="Projets"
            value={kpis.totalProjects}
            subtitle={`${kpis.totalEnvironments} environnements`}
          />
          <KpiCard
            title="Deploys / 7j"
            value={kpis.deploymentsLast7d}
            subtitle={`${kpis.deploymentsLast30d} ce mois-ci`}
          />
          <KpiCard
            title="Taux de succès"
            value={kpis.deploymentsLast7d > 0 ? `${kpis.successRate7d}%` : '—'}
            subtitle="7 derniers jours"
            icon={<CheckCircle2 size={11} />}
            tone={successRateTone}
          />
          <KpiCard
            title="Durée moyenne"
            value={formatDuration(kpis.avgDurationSeconds)}
            subtitle="par déploiement (30j)"
            icon={<Clock size={11} />}
          />
        </div>
      ) : null}

      {/* Status summary + Activity chart */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Status card */}
        {kpis && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
              État actuel
            </p>
            <ul className="space-y-2.5">
              {[
                { label: 'En cours', value: kpis.runningCount, color: 'bg-blue-400' },
                { label: 'Échecs (7j)', value: kpis.failedCount, color: 'bg-red-400' },
                { label: 'Projets inactifs', value: kpis.idleProjectsCount, color: 'bg-zinc-500' },
              ].map((item) => (
                <li key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <span className={`h-2 w-2 rounded-full ${item.color}`} />
                    {item.label}
                  </span>
                  <span className="font-semibold text-[var(--text-primary)]">{item.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Activity chart */}
        <div className="lg:col-span-2">
          {data?.activity ? (
            <ActivityChart data={data.activity} />
          ) : (
            <div className="h-full min-h-[140px] animate-pulse rounded-xl bg-[var(--hover)]" />
          )}
        </div>
      </div>

      {/* Top projects + Server health */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data?.topProjects && data.topProjects.length > 0 && (
          <TopProjectsCard projects={data.topProjects} />
        )}
        {data?.servers && isAdmin && data.servers.total > 0 && (
          <ServerHealthCard servers={data.servers} isAdmin={isAdmin} />
        )}
      </div>

      {/* Recent failures detail */}
      {data && data.recentFailures.length > 1 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <AlertTriangle size={14} className="text-red-400" />
            Déploiements en échec — 7 jours
          </p>
          <ul className="space-y-2">
            {data.recentFailures.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {f.projectName}
                  </span>
                  <span className="mx-1 text-[var(--text-secondary)]">·</span>
                  <span className="text-[var(--text-secondary)]">{f.environmentName}</span>
                  <span className="mx-1 text-[var(--text-secondary)]">·</span>
                  <code className="text-xs text-[var(--text-secondary)]">{f.branch}</code>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-secondary)]">
                    {formatRelative(f.createdAt)}
                  </span>
                  <Link
                    href={`/deployments/${f.id}`}
                    className="text-xs font-semibold text-red-400 hover:underline"
                  >
                    voir →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

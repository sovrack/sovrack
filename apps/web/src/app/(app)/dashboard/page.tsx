'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, RefreshCw, Rocket } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import { deploymentsService } from '@/services/deployments.service';
import { projectsService } from '@/services/projects.service';
import { serversService } from '@/services/servers.service';
import { DeploymentStatusBadge } from '@/components/deployments/deployment-status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import type { Deployment, DeploymentStatus } from '@/types/deployment';
import type { ProjectListItem } from '@/types/project';
import type { Server as ServerType } from '@/types/server';

type DashboardSimpleData = {
  projects: ProjectListItem[];
  deployments: Deployment[];
  servers: ServerType[];
};

const EMPTY_PROJECTS: ProjectListItem[] = [];
const EMPTY_DEPLOYMENTS: Deployment[] = [];
const EMPTY_SERVERS: ServerType[] = [];

const RUNNING_STATUSES: DeploymentStatus[] = ['PENDING', 'RUNNING'];
const ERRORED_STATUSES: DeploymentStatus[] = ['FAILED', 'CANCELED'];

function KpiCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: number;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        {title}
      </p>
      <p className="mt-3 text-5xl font-semibold leading-none text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">{subtitle}</p>
    </div>
  );
}

function formatRelative(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function isInLastDays(value: string, days: number): boolean {
  const ageMs = Date.now() - new Date(value).getTime();
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

async function fetchDashboardSimpleData(
  isAdmin: boolean,
): Promise<DashboardSimpleData> {
  const [projects, deployments] = await Promise.all([
    projectsService.getAll(),
    deploymentsService.getAll(),
  ]);

  let servers: ServerType[] = [];
  if (isAdmin) {
    try {
      servers = await serversService.getAll();
    } catch {
      servers = [];
    }
  }

  return { projects, deployments, servers };
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard-simple-v1', isAdmin],
    queryFn: () => fetchDashboardSimpleData(isAdmin),
    staleTime: 20_000,
  });

  const queryError = error ? getApiErrorMessage(error) : null;
  const projects = data?.projects ?? EMPTY_PROJECTS;
  const deployments = data?.deployments ?? EMPTY_DEPLOYMENTS;
  const servers = data?.servers ?? EMPTY_SERVERS;

  const totalEnvironments = useMemo(
    () =>
      projects.reduce(
        (sum, project) => sum + (project.environmentCount ?? 0),
        0,
      ),
    [projects],
  );

  const deployments7d = useMemo(
    () => deployments.filter((deployment) => isInLastDays(deployment.createdAt, 7)),
    [deployments],
  );

  const runningCount = useMemo(
    () =>
      deployments.filter((deployment) =>
        RUNNING_STATUSES.includes(deployment.status),
      ).length,
    [deployments],
  );

  const erroredCount = useMemo(
    () =>
      deployments.filter((deployment) =>
        ERRORED_STATUSES.includes(deployment.status),
      ).length,
    [deployments],
  );

  const idleCount = useMemo(() => {
    const activeProjectIds = new Set(deployments7d.map((d) => d.project.id));
    return Math.max(projects.length - activeProjectIds.size, 0);
  }, [deployments7d, projects.length]);

  const servicesCount = isAdmin ? servers.length : totalEnvironments;

  const recentDeployments = useMemo(
    () =>
      [...deployments]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 8),
    [deployments],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Home"
        title={`Welcome back, ${user?.fullName ?? 'Admin'}`}
        description="Overview of projects and deployment activity."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] disabled:opacity-50"
              aria-label="Refresh dashboard"
            >
              <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
            </button>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--bg-card)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
            >
              Go to projects <ArrowRight size={14} />
            </Link>
          </div>
        }
      />

      {queryError && (
        <Alert tone="error" title="Unable to load dashboard data">
          {queryError}
        </Alert>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 md:p-5">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          <KpiCard
            title="Projects"
            value={projects.length}
            subtitle={`${totalEnvironments} environments`}
          />
          <KpiCard
            title="Services"
            value={servicesCount}
            subtitle={
              isAdmin
                ? `${projects.length} projects • ${totalEnvironments} env`
                : `${totalEnvironments} environments`
            }
          />
          <KpiCard
            title="Deploys / 7D"
            value={deployments7d.length}
            subtitle={
              deployments7d.length > 0 ? 'last 7 days activity' : 'no activity yet'
            }
          />

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Status
            </p>
            <ul className="mt-4 space-y-2 text-lg text-[var(--text-primary)]">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="min-w-6 font-semibold">{runningCount}</span>
                <span className="text-base text-[var(--text-secondary)]">running</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="min-w-6 font-semibold">{erroredCount}</span>
                <span className="text-base text-[var(--text-secondary)]">errored</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-zinc-500" />
                <span className="min-w-6 font-semibold">{idleCount}</span>
                <span className="text-base text-[var(--text-secondary)]">idle</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <p className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
              <Rocket size={16} />
              Recent deployments
            </p>
            <Link
              href="/deployments"
              className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              view all →
            </Link>
          </div>

          <div className="min-h-[320px] p-4">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-12 animate-pulse rounded-lg bg-[var(--hover)]"
                  />
                ))}
              </div>
            ) : recentDeployments.length === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                <Rocket size={30} className="text-[var(--text-secondary)]/60" />
                <p className="mt-3 text-2xl text-[var(--text-secondary)]">
                  No deployments yet.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {recentDeployments.map((deployment) => (
                  <li
                    key={deployment.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {deployment.project.name} · {deployment.environment.name}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                          {deployment.branch} · by {deployment.user.fullName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <DeploymentStatusBadge status={deployment.status} size="sm" />
                        <span className="text-xs text-[var(--text-secondary)]">
                          {formatRelative(deployment.createdAt)}
                        </span>
                        <Link
                          href={`/deployments/${deployment.id}`}
                          className="text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                        >
                          view
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

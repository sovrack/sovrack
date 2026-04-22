'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Rocket,
  Plus,
  RefreshCw,
  Filter,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deploymentsService } from '@/services/deployments.service';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import { DeploymentStatusBadge } from '@/components/deployments/deployment-status-badge';
import { DeploymentCreateDialog } from '@/components/deployments/deployment-create-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { useAuthContext } from '@/contexts/auth-context';
import type { Deployment, DeploymentStatus } from '@/types/deployment';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/ui/pagination';
import type { ProjectRole } from '@/types/project';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_OPTIONS: { label: string; value: DeploymentStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Success', value: 'SUCCESS' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Canceled', value: 'CANCELED' },
];

export default function DeploymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useAuthContext();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<DeploymentStatus | 'ALL'>('ALL');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['deployments-page'],
    queryFn: async () => {
      const [deploymentList, projectList] = await Promise.all([
        deploymentsService.getAll(),
        projectsService.getAll(),
      ]);
      return { deployments: deploymentList, projects: projectList };
    },
  });

  const deployments: Deployment[] = data?.deployments ?? [];
  const error = queryError ? getApiErrorMessage(queryError) : null;
  const canCreateDeployment =
    isAdmin ||
    (data?.projects ?? []).some(
      (p) => p.currentUserProjectRole === 'OWNER' || p.currentUserProjectRole === 'DEVELOPER',
    );

  const fetchDeployments = async () => {
    await queryClient.invalidateQueries({ queryKey: ['deployments-page'] });
    await refetch();
  };

  const filtered = statusFilter === 'ALL'
    ? deployments
    : deployments.filter((d) => d.status === statusFilter);

  const projectRoleByProjectId = new Map<string, ProjectRole | null>(
    (data?.projects ?? []).map((project) => [
      project.id,
      project.currentUserProjectRole,
    ]),
  );

  const { page, totalPages, paged: pagedDeployments, goToPage, reset: resetPage } = usePagination(filtered, { pageSize: 20 });

  useEffect(() => { resetPage(); }, [statusFilter, resetPage]);

  useEffect(() => {
    if (searchParams.get('dialog') === 'create-deployment') {
      setCreateDialogOpen(true);
    }
  }, [searchParams]);

  const clearDialogQuery = () => {
    const next = new URLSearchParams(searchParams.toString());
    if (!next.has('dialog')) {
      return;
    }

    next.delete('dialog');
    const query = next.toString();
    router.replace(query ? `/deployments?${query}` : '/deployments');
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    clearDialogQuery();
  };

  const handleCreatedDeployment = async (deploymentId: string) => {
    await fetchDeployments();
    router.push(`/deployments/${deploymentId}`);
  };

  const canRollbackFromList = (deployment: Deployment): boolean => {
    if (deployment.status !== 'SUCCESS' && deployment.status !== 'FAILED') {
      return false;
    }

    if (isAdmin) {
      return true;
    }

    return projectRoleByProjectId.get(deployment.project.id) === 'OWNER';
  };

  const handleRollbackFromList = async (deploymentId: string) => {
    if (!confirm('Rollback vers la dernière image stable ?')) {
      return;
    }

    setActionError(null);
    setRollingBackId(deploymentId);
    try {
      const rollbackDeployment = await deploymentsService.rollback(deploymentId);
      await fetchDeployments();
      router.push(`/deployments/${rollbackDeployment.id}`);
    } catch (rollbackError) {
      setActionError(getApiErrorMessage(rollbackError));
    } finally {
      setRollingBackId(null);
    }
  };

  const runningCount = deployments.filter((d) => d.status === 'RUNNING').length;
  const successCount = deployments.filter((d) => d.status === 'SUCCESS').length;
  const failedCount = deployments.filter((d) => d.status === 'FAILED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deployment Center"
        title="Deployments"
        description="Track every release, filter by status and drill down into each run."
        actions={
          <>
            <button
              onClick={() => void fetchDeployments()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            {canCreateDeployment && (
              <button
                type="button"
                onClick={() => setCreateDialogOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:bg-[var(--text-primary)]"
              >
                <Plus size={16} /> New Deployment
              </button>
            )}
          </>
        }
      />

      <SectionCard contentClassName="!p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-muted)]">Total</p>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {deployments.length}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
              <CheckCircle2 size={14} />
              Successful
            </div>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {successCount}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
              <Activity size={14} />
              Running / Failed
            </div>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {runningCount + failedCount}
            </p>
          </div>
        </div>
      </SectionCard>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <SectionCard contentClassName="!p-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]/5 px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
            <Filter size={13} />
            Status
          </span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === opt.value
                  ? 'bg-[var(--text-primary)] text-[var(--bg-app)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]/10 hover:text-[var(--text-primary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </SectionCard>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--bg-card)]/10" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <SectionCard contentClassName="!py-16 text-center" className="border-dashed">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--text-primary)]/15">
            <Rocket size={28} className="text-[var(--text-secondary)]" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
            No deployments found
          </h3>
          <p className="mt-2 max-w-xs text-sm text-[var(--text-secondary)]">
            {statusFilter === 'ALL'
              ? 'No deployments yet. Launch your first deployment.'
              : `No deployments with status "${statusFilter}".`}
          </p>
          {statusFilter === 'ALL' && canCreateDeployment && (
            <button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:bg-[var(--text-primary)]"
            >
              <Plus size={16} /> Deploy
            </button>
          )}
        </SectionCard>
      )}

      {!loading && filtered.length > 0 && (
        <SectionCard contentClassName="!p-0" className="overflow-hidden">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-card)]/5">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Project</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Environment</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Branch</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Triggered by</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">When</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {pagedDeployments.map((dep) => (
                <tr key={dep.id} className="transition hover:bg-[var(--bg-card)]/5">
                  <td className="px-5 py-3.5 font-semibold text-[var(--text-primary)]">
                    <Link href={`/projects/${dep.project.id}`} className="transition hover:text-[var(--text-secondary)]">
                      {dep.project.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      dep.environment.name === 'PRODUCTION'
                        ? 'bg-red-500/15 text-red-300'
                        : 'bg-[var(--text-primary)]/15 text-[var(--text-secondary)]'
                    }`}>
                      {dep.environment.name}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-[var(--text-primary)]">{dep.branch}</td>
                  <td className="px-5 py-3.5">
                    <DeploymentStatusBadge status={dep.status} size="sm" />
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[var(--text-secondary)]">{dep.user.fullName}</td>
                  <td className="px-5 py-3.5 text-xs text-[var(--text-secondary)]">{timeAgo(dep.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-3">
                      {canRollbackFromList(dep) && (
                        <button
                          type="button"
                          onClick={() => void handleRollbackFromList(dep.id)}
                          disabled={rollingBackId !== null}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50"
                        >
                          {rollingBackId === dep.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          Rollback
                        </button>
                      )}
                      <Link
                        href={`/deployments/${dep.id}`}
                        className="text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                      >
                        View →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
      {!loading && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
      )}

      <DeploymentCreateDialog
        open={createDialogOpen}
        onClose={handleCloseCreateDialog}
        onCreated={handleCreatedDeployment}
      />
    </div>
  );
}

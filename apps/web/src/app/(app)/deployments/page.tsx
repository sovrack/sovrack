'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Rocket,
  Plus,
  RefreshCw,
  Filter,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deploymentsService } from '@/services/deployments.service';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import { DeploymentStatusBadge } from '@/components/deployments/deployment-status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { useAuthContext } from '@/contexts/auth-context';
import type { Deployment, DeploymentStatus } from '@/types/deployment';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/ui/pagination';

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
  const { isAdmin } = useAuthContext();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<DeploymentStatus | 'ALL'>('ALL');

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

  const { page, totalPages, paged: pagedDeployments, goToPage, reset: resetPage } = usePagination(filtered, { pageSize: 20 });

  useEffect(() => { resetPage(); }, [statusFilter, resetPage]);

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
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            {canCreateDeployment && (
              <Link
                href="/deployments/new"
                className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
              >
                <Plus size={16} /> New Deployment
              </Link>
            )}
          </>
        }
      />

      <SectionCard contentClassName="!p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">Total</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {deployments.length}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <CheckCircle2 size={14} />
              Successful
            </div>
            <p className="mt-1 text-2xl font-semibold text-emerald-800">
              {successCount}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
              <Activity size={14} />
              Running / Failed
            </div>
            <p className="mt-1 text-2xl font-semibold text-amber-800">
              {runningCount + failedCount}
            </p>
          </div>
        </div>
      </SectionCard>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <SectionCard contentClassName="!p-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-500">
            <Filter size={13} />
            Status
          </span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === opt.value
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-500 hover:bg-slate-100'
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
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <SectionCard contentClassName="!py-16 text-center" className="border-dashed">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
            <Rocket size={28} className="text-brand-500" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">
            No deployments found
          </h3>
          <p className="mt-2 max-w-xs text-sm text-slate-500">
            {statusFilter === 'ALL'
              ? 'No deployments yet. Launch your first deployment.'
              : `No deployments with status "${statusFilter}".`}
          </p>
          {statusFilter === 'ALL' && canCreateDeployment && (
            <Link
              href="/deployments/new"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
            >
              <Plus size={16} /> Deploy
            </Link>
          )}
        </SectionCard>
      )}

      {!loading && filtered.length > 0 && (
        <SectionCard contentClassName="!p-0" className="overflow-hidden">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Project</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Environment</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Triggered by</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">When</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedDeployments.map((dep) => (
                <tr key={dep.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3.5 font-semibold text-slate-900">
                    <Link href={`/projects/${dep.project.id}`} className="transition hover:text-brand-600">
                      {dep.project.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      dep.environment.name === 'PRODUCTION'
                        ? 'bg-red-50 text-red-600'
                        : 'bg-blue-50 text-blue-600'
                    }`}>
                      {dep.environment.name}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-600">{dep.branch}</td>
                  <td className="px-5 py-3.5">
                    <DeploymentStatusBadge status={dep.status} size="sm" />
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">{dep.user.fullName}</td>
                  <td className="px-5 py-3.5 text-slate-400 text-xs">{timeAgo(dep.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/deployments/${dep.id}`}
                      className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
                    >
                      View →
                    </Link>
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
    </div>
  );
}

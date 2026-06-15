'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Globe,
  Loader2,
  Plus,
  Rocket,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deploymentsService } from '@/services/deployments.service';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import { DeploymentCreateDialog } from '@/components/deployments/deployment-create-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/hooks/auth/use-auth';
import type { Deployment, DeploymentStatus } from '@/types/deployment';
import { usePagination } from '@/hooks/shared/use-pagination';
import { Pagination } from '@/components/ui/pagination';
import type { ProjectRole } from '@/types/project';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function duration(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start) return null;
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function resolveUrl(dep: Deployment): string | null {
  if (dep.publicUrl) return dep.publicUrl;
  const targets = dep.environment?.serviceTargets ?? [];
  const target = dep.serviceId
    ? targets.find((t) => t.serviceId === dep.serviceId)
    : targets[0];
  const server = target?.server ?? (dep.environment as Record<string, unknown> & { server?: { host: string } } | undefined)?.server;
  if (!server) return null;
  if (target?.domain) return `http://${target.domain}`;
  if (target?.port) return `http://${(server as {host:string}).host}:${String(target.port)}`;
  return null;
}

const STATUS_CONFIG: Record<DeploymentStatus, { dot: string; label: string; card: string }> = {
  RUNNING:  { dot: 'bg-blue-400 animate-pulse',  label: 'Running',  card: 'border-l-4 border-l-blue-500' },
  SUCCESS:  { dot: 'bg-green-400',               label: 'Success',    card: 'border-l-4 border-l-green-500' },
  FAILED:   { dot: 'bg-red-400',                 label: 'Failed',     card: 'border-l-4 border-l-red-500' },
  PENDING:  { dot: 'bg-amber-400 animate-pulse', label: 'Pending',card: 'border-l-4 border-l-amber-500' },
  CANCELED: { dot: 'bg-zinc-400',                label: 'Canceled',    card: 'border-l-4 border-l-zinc-500' },
};

const ENV_BADGE: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

const STATUS_OPTIONS: { label: string; value: DeploymentStatus | 'ALL'; count?: number }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Success', value: 'SUCCESS' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Canceled', value: 'CANCELED' },
];

/* ── Deployment Card ─────────────────────────────────────────────────────── */

function DeploymentCard({
  dep,
  canRollback,
  rollingBack,
  onRollback,
  onRedeploy,
}: {
  dep: Deployment;
  canRollback: boolean;
  rollingBack: boolean;
  onRollback: () => void;
  onRedeploy?: () => void;
}) {
  const cfg = STATUS_CONFIG[dep.status] ?? STATUS_CONFIG.PENDING;
  const url = resolveUrl(dep);
  const dur = duration(dep.startedAt, dep.finishedAt ?? (dep.status === 'RUNNING' ? undefined : dep.startedAt));
  const isLive = dep.status === 'RUNNING' || dep.status === 'PENDING';

  return (
    <div className={`rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] ${cfg.card} overflow-hidden transition hover:border-[var(--border)]`}>
      <div className="flex items-start justify-between gap-4 p-5">
        {/* Left: Status dot + main info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`} />

          <div className="min-w-0 flex-1">
            {/* Title row */}
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/projects/${dep.project.id}`} className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--text-secondary)] transition">
                {dep.project.name}
              </Link>
              {dep.service && (
                <span className="rounded-full bg-[var(--hover)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                  {dep.service.name}
                </span>
              )}
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${ENV_BADGE[dep.environment.name] ?? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400'}`}>
                {dep.environment.name}
              </span>
              <span className="font-mono text-xs text-[var(--text-muted)]">{dep.branch}</span>
            </div>

            {/* Meta row */}
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {timeAgo(dep.createdAt)}
              </span>
              {dur && (
                <span>Duration: {dur}{isLive && <span className="ml-0.5 animate-pulse">…</span>}</span>
              )}
              <span>by {dep.user.fullName}</span>
              {dep.externalPipelineId && (
                <span className="rounded bg-[var(--hover)] px-1.5 py-0.5 font-mono text-[9px]">pipeline #{dep.externalPipelineId}</span>
              )}
            </div>

            {/* URL */}
            {url && dep.status === 'SUCCESS' && (
              <div className="mt-2 flex items-center gap-2">
                <Globe size={12} className="text-green-400" />
                <a href={url} target="_blank" rel="noreferrer"
                  className="font-mono text-xs text-green-400 underline hover:text-green-300 truncate max-w-[200px]">
                  {url}
                </a>
                <a href={url} target="_blank" rel="noreferrer"
                  className="shrink-0 rounded-lg border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400 hover:bg-green-500/20 transition">
                  Open ↗
                </a>
              </div>
            )}

            {/* Failed hint */}
            {dep.status === 'FAILED' && (
              <p className="mt-1.5 text-xs text-red-400">Deployment failed — check the logs for details.</p>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Link href={`/deployments/${dep.id}`}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
            <ExternalLink size={12} /> View logs
          </Link>
          {canRollback && (
            <button type="button" onClick={onRollback} disabled={rollingBack}
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition">
              {rollingBack ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Rollback
            </button>
          )}
          {(dep.status === 'FAILED' || dep.status === 'SUCCESS') && onRedeploy && (
            <button type="button" onClick={onRedeploy}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] hover:opacity-90 transition">
              <Rocket size={12} /> Redeploy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function DeploymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<DeploymentStatus | 'ALL'>('ALL');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const [envFilter, setEnvFilter] = useState<string>('ALL');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [redeployProjectId, setRedeployProjectId] = useState<string | null>(null);
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
    refetchInterval: 10_000,
  });

  const deployments: Deployment[] = data?.deployments ?? [];
  const error = queryError ? getApiErrorMessage(queryError) : null;
  const canCreate = isAdmin || (data?.projects ?? []).some((p) => p.currentUserProjectRole === 'OWNER' || p.currentUserProjectRole === 'DEVELOPER');

  const fetchDeployments = async () => {
    await queryClient.invalidateQueries({ queryKey: ['deployments-page'] });
    await refetch();
  };

  const projectRoleMap = new Map<string, ProjectRole | null>(
    (data?.projects ?? []).map((p) => [p.id, p.currentUserProjectRole]),
  );

  const canRollback = (dep: Deployment) =>
    (dep.status === 'SUCCESS' || dep.status === 'FAILED') &&
    (isAdmin || projectRoleMap.get(dep.project.id) === 'OWNER');

  const handleRollback = async (depId: string) => {
    if (!confirm('Roll back to the last stable version?')) return;
    setActionError(null); setRollingBackId(depId);
    try {
      const rb = await deploymentsService.rollback(depId);
      await fetchDeployments();
      router.push(`/deployments/${rb.id}`);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    } finally {
      setRollingBackId(null);
    }
  };

  const filtered = deployments.filter((d) => {
    if (statusFilter  !== 'ALL' && d.status          !== statusFilter)  return false;
    if (projectFilter !== 'ALL' && d.project.id      !== projectFilter) return false;
    if (envFilter     !== 'ALL' && d.environment.name !== envFilter)    return false;
    return true;
  });
  const { page, totalPages, paged, goToPage, reset } = usePagination(filtered, { pageSize: 15 });
  useEffect(() => { reset(); }, [statusFilter, projectFilter, envFilter, reset]);

  const uniqueProjects = Array.from(new Map(deployments.map((d) => [d.project.id, d.project.name])).entries());
  const uniqueEnvs     = Array.from(new Set(deployments.map((d) => d.environment.name)));

  useEffect(() => {
    if (searchParams.get('dialog') === 'create-deployment') setCreateDialogOpen(true);
  }, [searchParams]);

  const clearDialog = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('dialog');
    const q = next.toString();
    router.replace(q ? `/deployments?${q}` : '/deployments');
  };

  const handleClose = () => { setCreateDialogOpen(false); setRedeployProjectId(null); clearDialog(); };
  const handleCreated = async () => { await fetchDeployments(); router.push('/deployments'); };

  /* Stats */
  const running = deployments.filter((d) => d.status === 'RUNNING').length;
  const success = deployments.filter((d) => d.status === 'SUCCESS').length;
  const failed  = deployments.filter((d) => d.status === 'FAILED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deployment Center"
        title="Deployments"
        description="Track every deployment, filter by status, and review logs."
        actions={
          <>
            {canCreate && (
              <button type="button" onClick={() => setCreateDialogOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:opacity-90">
                <Plus size={16} /> New deployment
              </button>
            )}
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total',          value: deployments.length, icon: <Rocket size={14} />,      color: '' },
          { label: 'Success',         value: success,            icon: <CheckCircle2 size={14} />, color: 'text-green-400' },
          { label: 'Running / Failed', value: running + failed, icon: <Activity size={14} />,    color: running > 0 ? 'text-blue-400' : failed > 0 ? 'text-red-400' : '' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
              {stat.icon} {stat.label}
            </div>
            <p className={`mt-2 text-3xl font-bold ${stat.color || 'text-[var(--text-primary)]'}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {(error || actionError) && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error ?? actionError}
        </div>
      )}

      {/* Filters row */}
      <div className="space-y-2">
        {/* Status filter */}
        <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 no-scrollbar">
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--text-muted)]">
            <Filter size={13} /> Status
          </span>
          {STATUS_OPTIONS.map((opt) => {
            const count = opt.value === 'ALL' ? deployments.length : deployments.filter((d) => d.status === opt.value).length;
            return (
              <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === opt.value ? 'bg-[var(--text-primary)] text-[var(--bg-app)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}>
                {opt.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${statusFilter === opt.value ? 'bg-white/20' : 'bg-[var(--hover)]'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Project + Env filters */}
        {(uniqueProjects.length > 1 || uniqueEnvs.length > 1) && (
          <div className="flex flex-wrap items-center gap-2">
            {uniqueProjects.length > 1 && (
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-zinc-500/20"
              >
                <option value="ALL">All projects</option>
                {uniqueProjects.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            )}
            {uniqueEnvs.length > 1 && (
              <select
                value={envFilter}
                onChange={(e) => setEnvFilter(e.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-zinc-500/20"
              >
                <option value="ALL">All environments</option>
                {uniqueEnvs.map((env) => (
                  <option key={env} value={env}>{env}</option>
                ))}
              </select>
            )}
            {(projectFilter !== 'ALL' || envFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => { setProjectFilter('ALL'); setEnvFilter('ALL'); }}
                className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                ✕ Effacer
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1,2,3,4].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--bg-card)]/10 border-l-4 border-l-[var(--border)]" />)}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-16 text-center">
          <Rocket size={28} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No deployments</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {statusFilter === 'ALL' ? 'Start your first deployment.' : `No deployments with status "${statusFilter}".`}
          </p>
          {statusFilter === 'ALL' && canCreate && (
            <button type="button" onClick={() => setCreateDialogOpen(true)}
              className="mt-5 flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90">
              <Plus size={15} /> Deploy
            </button>
          )}
        </div>
      )}

      {/* Cards */}
      {!loading && paged.length > 0 && (
        <div className="space-y-3">
          {paged.map((dep) => (
            <DeploymentCard
              key={dep.id}
              dep={dep}
              canRollback={canRollback(dep)}
              rollingBack={rollingBackId === dep.id}
              onRollback={() => void handleRollback(dep.id)}
              onRedeploy={() => { setRedeployProjectId(dep.project.id); setCreateDialogOpen(true); }}
            />
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
      )}

      <DeploymentCreateDialog
        open={createDialogOpen}
        initialProjectId={redeployProjectId ?? undefined}
        onClose={handleClose}
        onCreated={handleCreated}
      />
    </div>
  );
}

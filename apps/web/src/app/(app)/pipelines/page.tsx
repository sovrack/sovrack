'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  ExternalLink,
  GitBranch,
  GitMerge,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
  Clock,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import type { GitlabPipeline, ProjectListItem } from '@/types/project';

type PipelineWithProject = GitlabPipeline & { project: Pick<ProjectListItem, 'id' | 'name'> };

function pipelineStatusTone(status: string) {
  if (status === 'success') return 'success' as const;
  if (status === 'failed' || status === 'canceled') return 'error' as const;
  if (status === 'running') return 'info' as const;
  if (status === 'pending' || status === 'created') return 'default' as const;
  return 'default' as const;
}

function PipelineStatusBadge({ status }: { status: string }) {
  const tone = pipelineStatusTone(status);
  const icon =
    status === 'success' ? <CheckCircle size={10} /> :
    status === 'failed' || status === 'canceled' ? <XCircle size={10} /> :
    status === 'running' ? <Loader2 size={10} className="animate-spin" /> :
    <Clock size={10} />;

  return (
    <Badge tone={tone} size="sm">
      {icon}
      {status}
    </Badge>
  );
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PipelinesPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [pipelines, setPipelines] = useState<PipelineWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [commitFilter, setCommitFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allProjects = await projectsService.getAll();
      setProjects(allProjects);

      const results = await Promise.allSettled(
        allProjects.map(async (p) => {
          const items = await projectsService.getPipelines(p.id);
          return items.map((item) => ({ ...item, project: { id: p.id, name: p.name } }));
        }),
      );

      const merged: PipelineWithProject[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          merged.push(...result.value);
        }
      }
      merged.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setPipelines(merged);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTrigger = async (projectId: string, ref: string) => {
    setTriggeringId(`${projectId}-${ref}`);
    try {
      await projectsService.triggerPipeline(projectId, ref);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setTriggeringId(null);
    }
  };

  const statusOptions = useMemo(
    () => Array.from(new Set(pipelines.map((pipeline) => pipeline.status))).sort(),
    [pipelines],
  );
  const branchOptions = useMemo(
    () => Array.from(new Set(pipelines.map((pipeline) => pipeline.ref))).sort(),
    [pipelines],
  );

  const filtered = useMemo(() => {
    return pipelines.filter((pipeline) => {
      const projectMatch =
        selectedProjectId === 'all' || pipeline.project.id === selectedProjectId;
      const statusMatch = statusFilter === 'all' || pipeline.status === statusFilter;
      const branchMatch = branchFilter === 'all' || pipeline.ref === branchFilter;
      const commitMatch =
        commitFilter.trim().length === 0 ||
        pipeline.sha.toLowerCase().includes(commitFilter.trim().toLowerCase());
      return projectMatch && statusMatch && branchMatch && commitMatch;
    });
  }, [branchFilter, commitFilter, pipelines, selectedProjectId, statusFilter]);

  const stats = useMemo(() => ({
    total: pipelines.length,
    success: pipelines.filter((p) => p.status === 'success').length,
    failed: pipelines.filter((p) => p.status === 'failed').length,
    running: pipelines.filter((p) => p.status === 'running' || p.status === 'pending').length,
  }), [pipelines]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CI/CD"
        title="Pipelines"
        description="Monitor GitLab CI pipelines across all your projects."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: stats.total, tone: 'default' },
          { label: 'Success', value: stats.success, tone: 'success' },
          { label: 'Failed', value: stats.failed, tone: 'error' },
          { label: 'Running', value: stats.running, tone: 'info' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">{value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Filter */}
      <SectionCard title="Filter" description="Project, status, branch, commit." contentClassName="pt-0">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
          >
            <option value="all">All branches</option>
            {branchOptions.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>

          <input
            value={commitFilter}
            onChange={(e) => setCommitFilter(e.target.value)}
            placeholder="Commit SHA"
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
          />
        </div>
      </SectionCard>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--text-secondary)]" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <SectionCard>
          <EmptyState
            icon={GitMerge}
            title="No pipelines found"
            description={
              pipelines.length === 0
                ? 'Pipelines will appear here once your projects are connected to GitLab and CI runs.'
                : 'No pipeline matches the current filters.'
            }
          />
        </SectionCard>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((pipeline) => {
            const triggerKey = `${pipeline.project.id}-${pipeline.ref}`;
            return (
              <div
                key={`${pipeline.project.id}-${pipeline.id}`}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition hover:border-[var(--border)]/70"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/projects/${pipeline.project.id}`}
                        className="text-sm font-semibold text-[var(--text-primary)] hover:underline"
                      >
                        {pipeline.project.name}
                      </Link>
                      <PipelineStatusBadge status={pipeline.status} />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1">
                        <GitBranch size={11} />
                        {pipeline.ref}
                      </span>
                      {pipeline.sha && (
                        <span className="font-mono">
                          {pipeline.sha.slice(0, 7)}
                        </span>
                      )}
                      <span>{formatRelative(pipeline.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={triggeringId === triggerKey
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Play size={13} />}
                      onClick={() => void handleTrigger(pipeline.project.id, pipeline.ref)}
                      disabled={!!triggeringId}
                      loading={triggeringId === triggerKey}
                    >
                      Re-run
                    </Button>
                    <a
                      href={pipeline.web_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--border)]"
                    >
                      <ExternalLink size={12} />
                      GitLab
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { useProjectGitlab } from '@/hooks/projects/use-project-gitlab';
import { getApiErrorMessage } from '@/lib/api';
import type { ProjectDetail } from '@/types/project';

type Props = {
  projectId: string;
  project: ProjectDetail | null;
  refreshProject: () => Promise<void>;
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  running: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  success: 'border-green-500/30 bg-green-500/10 text-green-400',
  failed: 'border-red-500/30 bg-red-500/10 text-red-400',
  canceled: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
  skipped: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
  created: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};

export function PipelineTab({ projectId, project, refreshProject }: Props) {
  const gitlab = useProjectGitlab({ projectId, project, refreshProject });
  const [error, setError] = useState<string | null>(null);

  const handleTriggerPipeline = async () => {
    setError(null);
    try {
      await gitlab.handleTriggerPipeline();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const hasConfig = !!gitlab.gitlabConfig;

  if (!hasConfig) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-14 text-center">
        <GitBranch size={28} className="mb-3 text-[var(--text-muted)]" />
        <p className="text-sm font-semibold text-[var(--text-primary)]">No Git source connected</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Connect a GitLab repository in Configuration tab to see pipelines.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitCommitHorizontal size={15} className="text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Pipelines</p>
          <span className="rounded-full border border-[var(--border)] bg-[var(--hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
            {gitlab.pipelines.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => gitlab.loadGitlabData()}
            disabled={gitlab.gitlabLoading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <RefreshCw size={12} className={gitlab.gitlabLoading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => void handleTriggerPipeline()}
            disabled={gitlab.pipelineSubmitting}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
          >
            {gitlab.pipelineSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Trigger pipeline
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {gitlab.gitlabLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-8 text-sm text-[var(--text-secondary)]">
          <Loader2 size={14} className="animate-spin" /> Loading pipelines…
        </div>
      ) : gitlab.pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-14 text-center">
          <GitCommitHorizontal size={28} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No pipelines yet</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Push code to your repository or trigger a pipeline manually.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          {gitlab.pipelines.map((p, i) => (
            <div key={p.id}
              className={`flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--hover)] ${i !== 0 ? 'border-t border-[var(--border)]' : ''}`}>
              <div className={`h-2 w-2 shrink-0 rounded-full ${
                p.status === 'success' ? 'bg-green-400' :
                p.status === 'running' ? 'bg-blue-400 animate-pulse' :
                p.status === 'failed' ? 'bg-red-400' :
                'bg-zinc-400'
              }`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded border border-[var(--border)] bg-[var(--hover)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    #{p.id}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[p.status] ?? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400'}`}>
                    {p.status}
                  </span>
                  <span className="font-mono text-xs text-[var(--text-primary)]">{p.ref}</span>
                </div>
                {p.sha && (
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">{p.sha.slice(0, 8)}</p>
                )}
              </div>
              {p.web_url && (
                <a href={p.web_url} target="_blank" rel="noreferrer"
                  className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[10px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
                  View →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

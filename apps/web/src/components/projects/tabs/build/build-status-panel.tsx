'use client';

import { ExternalLink, GitBranch, RefreshCw } from 'lucide-react';
import { SectionCard } from '@/components/layout/section-card';
import type { BuildAllResult, BuildStatusResult } from '@/services/build.service';

const PIPELINE_STATUS_STYLE: Record<string, string> = {
  success: 'text-green-400 bg-green-500/10 border-green-500/20',
  failed: 'text-red-400 bg-red-500/10 border-red-500/20',
  running: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  canceled: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
};

export const WEBHOOK_STATUS_STYLE: Record<BuildAllResult['webhookStatus'], string> = {
  CONFIGURED: 'border-green-500/30 bg-green-500/10 text-green-300',
  PENDING_CONFIGURATION: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  FAILED: 'border-red-500/30 bg-red-500/10 text-red-300',
  DISABLED: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
};

export const WEBHOOK_STATUS_LABEL: Record<BuildAllResult['webhookStatus'], string> = {
  CONFIGURED: 'Webhook configured',
  PENDING_CONFIGURATION: 'Webhook en attente',
  FAILED: 'Webhook failed',
  DISABLED: 'Webhook disabled',
};

export type BuildStatusPanelProps = {
  buildStatus: BuildStatusResult | null;
  buildStatusLoading: boolean;
  onRefresh: () => void;
};

export function BuildStatusPanel({
  buildStatus,
  buildStatusLoading,
  onRefresh,
}: BuildStatusPanelProps) {
  if (!buildStatus || buildStatus.services.length === 0) {
    return null;
  }

  return (
    <SectionCard
      title="Services status"
      description="Generation and pipeline status per service."
      contentClassName="space-y-2"
      actions={
        <button
          type="button"
          onClick={onRefresh}
          disabled={buildStatusLoading}
          className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw size={12} className={buildStatusLoading ? 'animate-spin' : ''} />
        </button>
      }
    >
      {buildStatus.services.map((svc) => (
        <div key={svc.id} className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <GitBranch size={13} className="shrink-0 text-[var(--text-muted)]" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{svc.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {svc.type}
                  {svc.defaultBranch ? ` · ${svc.defaultBranch}` : ''}
                  {svc.repositoryPath ? ` · ${svc.repositoryPath}` : ''}
                </p>
                <p className="text-xs text-[var(--text-muted)] font-mono">
                  GitLab ID: {svc.gitlabProjectId ?? 'missing'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${svc.ready ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                {svc.ready ? 'READY' : 'NOT READY'}
              </span>
              {svc.lastPipeline ? (
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${PIPELINE_STATUS_STYLE[svc.lastPipeline.status.toLowerCase()] ?? PIPELINE_STATUS_STYLE.pending}`}>
                    {svc.lastPipeline.status}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] font-mono">#{svc.lastPipeline.id}</span>
                  {svc.lastPipeline.webUrl && (
                    <a href={svc.lastPipeline.webUrl} target="_blank" rel="noreferrer" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ) : (
                <span className="text-xs text-[var(--text-muted)]">Aucun pipeline</span>
              )}
            </div>
          </div>
          {svc.missingRequirements.length > 0 && (
            <p className="mt-1.5 text-xs text-amber-300">
              Manquants: {svc.missingRequirements.join(' · ')}
            </p>
          )}
        </div>
      ))}
    </SectionCard>
  );
}

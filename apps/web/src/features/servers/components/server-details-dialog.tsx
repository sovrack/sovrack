'use client';

import { useEffect } from 'react';
import { Server as ServerIcon, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  ServerOverallStatusBadge,
  ServerWorkflowBadges,
} from '@/features/servers/components/server-status-badges';
import { ServerJobsPanel } from '@/features/servers/components/server-jobs-panel';
import type { Server, ServerJob } from '@/features/servers/types/server';

type ServerDetailsDialogProps = {
  open: boolean;
  server: Server | null;
  jobs: ServerJob[];
  jobsLoading: boolean;
  isBusy: boolean;
  retryingJobId: string | null;
  cancelingJobId?: string | null;
  formatJobType: (type: ServerJob['type']) => string;
  canRetryJob: (job: ServerJob) => boolean;
  canCancelJob?: (job: ServerJob) => boolean;
  getJobStatusClassName: (status: ServerJob['status']) => string;
  onClose: () => void;
  onRefreshJobs: (serverId: string) => Promise<void>;
  onRetryJob: (serverId: string, jobId: string) => Promise<void>;
  onCancelJob?: (serverId: string, jobId: string) => Promise<void>;
};

export function ServerDetailsDialog({
  open,
  server,
  jobs,
  jobsLoading,
  isBusy,
  retryingJobId,
  cancelingJobId,
  formatJobType,
  canRetryJob,
  canCancelJob,
  getJobStatusClassName,
  onClose,
  onRefreshJobs,
  onRetryJob,
  onCancelJob,
}: ServerDetailsDialogProps) {
  useEffect(() => {
    if (!open || !server) {
      return;
    }
    if (jobs.length === 0 && !jobsLoading) {
      void onRefreshJobs(server.id);
    }
  }, [jobs.length, jobsLoading, onRefreshJobs, open, server]);

  if (!open || !server) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <div className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Infrastructure
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              Server Details
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {server.name} · {server.username}@{server.host}:{server.port}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-card)]">
                <ServerIcon size={18} className="text-[var(--text-secondary)]" />
              </div>
              <div className="space-y-2">
                <ServerOverallStatusBadge server={server} />
                <ServerWorkflowBadges server={server} />
                <p className="text-xs text-[var(--text-secondary)]">
                  Ansible is executed from the platform control node. This VPS is managed through SSH and does not need Ansible installed locally.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                Last SSH validation
              </p>
              <p className="mt-2 text-sm text-[var(--text-primary)]">
                {server.lastVerifiedAt
                  ? new Date(server.lastVerifiedAt).toLocaleString()
                  : 'Not validated yet'}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                Last detection
              </p>
              <p className="mt-2 text-sm text-[var(--text-primary)]">
                {server.lastDetectedAt
                  ? new Date(server.lastDetectedAt).toLocaleString()
                  : 'Not detected yet'}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                Last preparation
              </p>
              <p className="mt-2 text-sm text-[var(--text-primary)]">
                {server.lastPreparedAt
                  ? new Date(server.lastPreparedAt).toLocaleString()
                  : 'Not prepared yet'}
              </p>
            </div>
          </div>

          <ServerJobsPanel
            serverId={server.id}
            jobs={jobs}
            jobsLoading={jobsLoading}
            isBusy={isBusy}
            retryingJobId={retryingJobId}
            cancelingJobId={cancelingJobId}
            formatJobType={formatJobType}
            canRetryJob={canRetryJob}
            canCancelJob={canCancelJob}
            getJobStatusClassName={getJobStatusClassName}
            onRefreshJobs={onRefreshJobs}
            onRetryJob={onRetryJob}
            onCancelJob={onCancelJob}
          />
        </div>

        <div className="sticky bottom-0 flex items-center justify-end border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

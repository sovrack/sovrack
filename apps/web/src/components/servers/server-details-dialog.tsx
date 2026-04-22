'use client';

import { useEffect } from 'react';
import { CheckCircle, Server as ServerIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ServerOverallStatusBadge,
  ServerStatusBadges,
} from '@/components/servers/server-status-badges';
import { ServerJobsPanel } from '@/components/servers/server-jobs-panel';
import type { Server, ServerJob } from '@/types/server';

type ManualChecklist = {
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
};

type ServerDetailsDialogProps = {
  open: boolean;
  server: Server | null;
  checklist: ManualChecklist;
  jobs: ServerJob[];
  jobsLoading: boolean;
  isBusy: boolean;
  savingManualId: string | null;
  retryingJobId: string | null;
  formatJobType: (type: ServerJob['type']) => string;
  canRetryJob: (job: ServerJob) => boolean;
  getJobStatusClassName: (status: ServerJob['status']) => string;
  onClose: () => void;
  onChecklistChange: (
    server: Server,
    field: keyof ManualChecklist,
    value: boolean,
  ) => void;
  onManualSave: (server: Server) => Promise<void>;
  onMarkReady: (server: Server) => Promise<void>;
  onRefreshJobs: (serverId: string) => Promise<void>;
  onRetryJob: (serverId: string, jobId: string) => Promise<void>;
};

export function ServerDetailsDialog({
  open,
  server,
  checklist,
  jobs,
  jobsLoading,
  isBusy,
  savingManualId,
  retryingJobId,
  formatJobType,
  canRetryJob,
  getJobStatusClassName,
  onClose,
  onChecklistChange,
  onManualSave,
  onMarkReady,
  onRefreshJobs,
  onRetryJob,
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
                <ServerOverallStatusBadge
                  isActive={server.isActive}
                  isVerified={server.isVerified}
                  hasDocker={server.hasDocker}
                  hasAnsible={server.hasAnsible}
                  hasRunner={server.hasRunner}
                />
                <ServerStatusBadges
                  isVerified={server.isVerified}
                  hasDocker={server.hasDocker}
                  hasAnsible={server.hasAnsible}
                  hasRunner={server.hasRunner}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Manual Checklist
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  { key: 'isVerified', label: 'SSH reachable' },
                  { key: 'hasDocker', label: 'Docker installed' },
                  { key: 'hasAnsible', label: 'Ansible installed' },
                  { key: 'hasRunner', label: 'GitLab Runner installed' },
                ] as const
              ).map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"
                >
                  <input
                    type="checkbox"
                    checked={checklist[key]}
                    onChange={(event) =>
                      onChecklistChange(server, key, event.target.checked)
                    }
                    disabled={isBusy}
                    className="accent-zinc-500"
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void onManualSave(server)}
                disabled={isBusy}
                loading={savingManualId === server.id}
              >
                Save manual status
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void onMarkReady(server)}
                disabled={isBusy}
                className="border-green-500/30 text-green-700 hover:bg-green-100"
                loading={savingManualId === server.id}
                icon={savingManualId === server.id ? undefined : <CheckCircle size={13} />}
              >
                Mark ready
              </Button>
            </div>
          </div>

          <ServerJobsPanel
            serverId={server.id}
            jobs={jobs}
            jobsLoading={jobsLoading}
            isBusy={isBusy}
            retryingJobId={retryingJobId}
            formatJobType={formatJobType}
            canRetryJob={canRetryJob}
            getJobStatusClassName={getJobStatusClassName}
            onRefreshJobs={onRefreshJobs}
            onRetryJob={onRetryJob}
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

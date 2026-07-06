import { useState } from "react";
import {
  ChevronDown,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScrollText,
  XCircle,
} from "lucide-react";
import type {
  ServerJob,
  ServerSetup,
} from "@/features/servers/types/server";

type ServerJobsPanelProps = {
  serverId: string;
  jobs: ServerJob[];
  jobsLoading: boolean;
  isBusy: boolean;
  retryingJobId: string | null;
  cancelingJobId?: string | null;
  formatJobType: (type: ServerJob["type"]) => string;
  canRetryJob: (job: ServerJob) => boolean;
  canCancelJob?: (job: ServerJob) => boolean;
  getJobStatusClassName: (status: ServerJob["status"]) => string;
  onRefreshJobs: (serverId: string) => Promise<void>;
  onRetryJob: (serverId: string, jobId: string) => Promise<void>;
  onCancelJob?: (serverId: string, jobId: string) => Promise<void>;
  // A2: PREPARE_SERVER jobs link to the detailed ServerRun (step-by-step
  // Ansible log) they triggered via job.setupId — merges what the now
  // -removed standalone "Logs" dialog showed directly into this list.
  setups: ServerSetup[];
  onViewSetupLogs: (setup: ServerSetup) => void;
};

export function ServerJobsPanel({
  serverId,
  jobs,
  jobsLoading,
  isBusy,
  retryingJobId,
  cancelingJobId,
  formatJobType,
  canRetryJob,
  canCancelJob,
  getJobStatusClassName,
  onRefreshJobs,
  onRetryJob,
  onCancelJob,
  setups,
  onViewSetupLogs,
}: ServerJobsPanelProps) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--hover)] p-3 bg-[var(--bg-card)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
          Job History
        </p>
        <button
          type="button"
          onClick={() => void onRefreshJobs(serverId)}
          disabled={isBusy}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {jobsLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          Refresh
        </button>
      </div>

      {jobs.length === 0 && !jobsLoading && (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          No jobs yet for this server.
        </p>
      )}

      {/* Active/blocked job warning — server is locked until this clears */}
      {(() => {
        const activeJob = jobs.find(
          (j) =>
            j.status === "RUNNING" ||
            j.status === "PENDING" ||
            j.status === "BLOCKED",
        );
        if (!activeJob || !onCancelJob) return null;
        const isBlocked = activeJob.status === "BLOCKED";
        return (
          <div
            className={`mt-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
              isBlocked
                ? "border-red-500/30 bg-red-500/10"
                : "border-blue-500/30 bg-blue-500/10"
            }`}
          >
            <p
              className={`text-[11px] ${isBlocked ? "text-red-300" : "text-blue-300"}`}
            >
              {isBlocked
                ? "A job is stuck — the server is locked. Cancel it to unlock."
                : `${formatJobType(activeJob.type)} running — the server is locked until it finishes.`}
            </p>
            <button
              type="button"
              onClick={() => void onCancelJob(serverId, activeJob.id)}
              disabled={cancelingJobId === activeJob.id}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {cancelingJobId === activeJob.id ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <XCircle size={11} />
              )}
              Cancel job
            </button>
          </div>
        );
      })()}

      <div className="mt-2 space-y-2">
        {jobs.slice(0, 5).map((job) => {
          const isExpanded = expandedJobId === job.id;
          const setup = job.setupId
            ? (setups.find((p) => p.id === job.setupId) ?? null)
            : null;
          return (
            <div
              key={job.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2"
            >
              <div
                role="button"
                tabIndex={0}
                aria-label={`Toggle details for ${formatJobType(job.type)} job`}
                onClick={() =>
                  setExpandedJobId((prev) => (prev === job.id ? null : job.id))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedJobId((prev) =>
                      prev === job.id ? null : job.id,
                    );
                  }
                }}
                className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <ChevronDown
                    size={12}
                    className={`shrink-0 text-[var(--text-secondary)] transition ${isExpanded ? "rotate-180" : ""}`}
                  />
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {formatJobType(job.type)}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {new Date(job.createdAt).toLocaleString()} · attempts{" "}
                      {job.attempts}/{job.maxAttempts}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${getJobStatusClassName(
                      job.status,
                    )}`}
                  >
                    {job.status.replace("_", " ")}
                  </span>
                  {canCancelJob?.(job) && onCancelJob && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onCancelJob(serverId, job.id);
                      }}
                      disabled={cancelingJobId === job.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {cancelingJobId === job.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <XCircle size={11} />
                      )}
                      Cancel
                    </button>
                  )}
                  {canRetryJob(job) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onRetryJob(serverId, job.id);
                      }}
                      disabled={isBusy || retryingJobId === job.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                    >
                      {retryingJobId === job.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <RotateCcw size={11} />
                      )}
                      Retry
                    </button>
                  )}
                </div>
              </div>

              {!isExpanded && job.output && (
                <p className="mt-1 line-clamp-2 text-[11px] text-[var(--text-secondary)]">
                  {job.output}
                </p>
              )}
              {!isExpanded && job.error && (
                <p className="mt-1 line-clamp-2 text-[11px] text-red-400">
                  {job.error}
                </p>
              )}

              {isExpanded && (
                <div className="mt-2 space-y-2 border-t border-[var(--border)] pt-2">
                  {job.output && (
                    <p className="whitespace-pre-wrap text-[11px] text-[var(--text-secondary)]">
                      {job.output}
                    </p>
                  )}
                  {job.error && (
                    <p className="whitespace-pre-wrap text-[11px] text-red-400">
                      {job.error}
                    </p>
                  )}
                  {!job.output && !job.error && (
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      No output recorded for this job.
                    </p>
                  )}
                  {setup && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewSetupLogs(setup);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--hover)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                    >
                      <ScrollText size={11} />
                      View step-by-step Ansible log
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

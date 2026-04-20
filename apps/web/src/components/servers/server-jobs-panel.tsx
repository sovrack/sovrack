import { Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import type { ServerJob } from '@/types/server';

type ServerJobsPanelProps = {
  serverId: string;
  jobs: ServerJob[];
  jobsLoading: boolean;
  isBusy: boolean;
  retryingJobId: string | null;
  formatJobType: (type: ServerJob['type']) => string;
  canRetryJob: (job: ServerJob) => boolean;
  getJobStatusClassName: (status: ServerJob['status']) => string;
  onRefreshJobs: (serverId: string) => Promise<void>;
  onRetryJob: (serverId: string, jobId: string) => Promise<void>;
};

export function ServerJobsPanel({
  serverId,
  jobs,
  jobsLoading,
  isBusy,
  retryingJobId,
  formatJobType,
  canRetryJob,
  getJobStatusClassName,
  onRefreshJobs,
  onRetryJob,
}: ServerJobsPanelProps) {
  return (
    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
          Job History
        </p>
        <button
          onClick={() => void onRefreshJobs(serverId)}
          disabled={isBusy}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
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
        <p className="mt-2 text-xs text-violet-700/80">No jobs yet for this server.</p>
      )}

      <div className="mt-2 space-y-2">
        {jobs.slice(0, 5).map((job) => (
          <div key={job.id} className="rounded-lg border border-violet-100 bg-white/80 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-800">{formatJobType(job.type)}</p>
                <p className="text-[11px] text-slate-500">
                  {new Date(job.createdAt).toLocaleString()} · attempts {job.attempts}/
                  {job.maxAttempts}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${getJobStatusClassName(
                    job.status,
                  )}`}
                >
                  {job.status.replace('_', ' ')}
                </span>
                {canRetryJob(job) && (
                  <button
                    onClick={() => void onRetryJob(serverId, job.id)}
                    disabled={isBusy || retryingJobId === job.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
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
            {job.output && <p className="mt-1 line-clamp-2 text-[11px] text-slate-600">{job.output}</p>}
            {job.error && <p className="mt-1 line-clamp-2 text-[11px] text-red-600">{job.error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

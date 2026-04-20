import { CheckCircle, Loader2, Save, Server, XCircle } from 'lucide-react';
import { ServerStatusBadges } from '@/components/servers/server-status-badges';
import { ServerActions } from '@/components/servers/server-actions';
import { ServerInstallPanel } from '@/components/servers/server-install-panel';
import { ServerJobsPanel } from '@/components/servers/server-jobs-panel';
import type { Server as ServerType, ServerJob } from '@/types/server';

type ManualChecklist = {
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
};

type InstallOptions = {
  docker: boolean;
  ansible: boolean;
  runner: boolean;
};

type ServerCardProps = {
  server: ServerType;
  checklist: ManualChecklist;
  installOptions: InstallOptions;
  jobs: ServerJob[];
  jobsLoading: boolean;
  isBusy: boolean;
  verifyingId: string | null;
  installingId: string | null;
  deletingId: string | null;
  savingManualId: string | null;
  registeringId: string | null;
  retryingJobId: string | null;
  formatConnectionMode: (mode: ServerType['connectionMode']) => string;
  formatJobType: (type: ServerJob['type']) => string;
  canRetryJob: (job: ServerJob) => boolean;
  getJobStatusClassName: (status: ServerJob['status']) => string;
  onVerify: (id: string) => Promise<void>;
  onOpenRunner: (serverId: string) => void;
  onDelete: (id: string, name: string) => Promise<void>;
  onInstallOptionChange: (
    server: ServerType,
    field: keyof InstallOptions,
    value: boolean,
  ) => void;
  onInstall: (server: ServerType) => Promise<void>;
  onChecklistChange: (
    server: ServerType,
    field: keyof ManualChecklist,
    value: boolean,
  ) => void;
  onManualSave: (server: ServerType) => Promise<void>;
  onMarkReady: (server: ServerType) => Promise<void>;
  onRefreshJobs: (serverId: string) => Promise<void>;
  onRetryJob: (serverId: string, jobId: string) => Promise<void>;
};

export function ServerCard({
  server,
  checklist,
  installOptions,
  jobs,
  jobsLoading,
  isBusy,
  verifyingId,
  installingId,
  deletingId,
  savingManualId,
  registeringId,
  retryingJobId,
  formatConnectionMode,
  formatJobType,
  canRetryJob,
  getJobStatusClassName,
  onVerify,
  onOpenRunner,
  onDelete,
  onInstallOptionChange,
  onInstall,
  onChecklistChange,
  onManualSave,
  onMarkReady,
  onRefreshJobs,
  onRetryJob,
}: ServerCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:border-slate-300 hover:shadow-theme-lg">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              server.isVerified ? 'bg-emerald-50' : 'bg-slate-100'
            }`}
          >
            <Server
              size={18}
              className={server.isVerified ? 'text-emerald-600' : 'text-slate-400'}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{server.name}</h3>
              {server.isVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle size={10} /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  <XCircle size={10} /> Not verified
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  server.onboardingStep === 'PENDING'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : server.onboardingStep === 'KEY_INSTALLED'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : server.onboardingStep === 'VALIDATED'
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : server.onboardingStep === 'READY'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                {server.onboardingStep === 'PENDING' && 'Non config'}
                {server.onboardingStep === 'KEY_INSTALLED' && 'Clé inst'}
                {server.onboardingStep === 'VALIDATED' && 'Validé'}
                {server.onboardingStep === 'READY' && 'Prêt'}
              </span>
            </div>

            <p className="mt-0.5 font-mono text-xs text-slate-400">
              {server.username}@{server.host}:{server.port}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Ajouté le{' '}
              {new Date(server.createdAt).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold uppercase tracking-[0.08em] text-slate-500">
                Mode {formatConnectionMode(server.connectionMode)}
              </span>
              {server.connectionMode === 'bastion' && server.bastionHost && (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                  via {server.bastionHost}:{server.bastionPort ?? 22}
                </span>
              )}
              {server.connectionMode === 'agent' && (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                  {server.agentLastSeenAt
                    ? `Last seen ${new Date(server.agentLastSeenAt).toLocaleString()}`
                    : 'Agent waiting for first heartbeat'}
                </span>
              )}
            </div>

            <div className="mt-2">
              <ServerStatusBadges
                isVerified={server.isVerified}
                hasDocker={server.hasDocker}
                hasAnsible={server.hasAnsible}
                hasRunner={server.hasRunner}
              />
            </div>
          </div>
        </div>

        <ServerActions
          server={server}
          isBusy={isBusy}
          verifyingId={verifyingId}
          registeringId={registeringId}
          deletingId={deletingId}
          onVerify={onVerify}
          onOpenRunner={onOpenRunner}
          onDelete={onDelete}
        />
      </div>

      <ServerInstallPanel
        server={server}
        isBusy={isBusy}
        installingId={installingId}
        installOptions={installOptions}
        onOptionChange={onInstallOptionChange}
        onInstall={onInstall}
      />

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Manual Checklist
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={checklist.isVerified}
              onChange={(event) => onChecklistChange(server, 'isVerified', event.target.checked)}
              disabled={isBusy}
            />
            SSH reachable
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={checklist.hasDocker}
              onChange={(event) => onChecklistChange(server, 'hasDocker', event.target.checked)}
              disabled={isBusy}
            />
            Docker installed
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={checklist.hasAnsible}
              onChange={(event) => onChecklistChange(server, 'hasAnsible', event.target.checked)}
              disabled={isBusy}
            />
            Ansible installed
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={checklist.hasRunner}
              onChange={(event) => onChecklistChange(server, 'hasRunner', event.target.checked)}
              disabled={isBusy}
            />
            GitLab Runner installed
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void onManualSave(server)}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {savingManualId === server.id ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            Save manual status
          </button>
          <button
            onClick={() => void onMarkReady(server)}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            {savingManualId === server.id ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CheckCircle size={13} />
            )}
            Mark ready
          </button>
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
  );
}

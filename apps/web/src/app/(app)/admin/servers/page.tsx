'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { ServerCard } from '@/components/servers/server-card';
import { ServerRunnerModal } from '@/components/servers/server-runner-modal';
import { useServerActions } from '@/hooks/useServerActions';

export default function AdminServersPage() {
  const servers = useServerActions();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infrastructure"
        title="Servers"
        description="Configure servers with manual checklist updates or SSH auto-verification before linking them to environments."
        actions={
          <>
            <button
              onClick={() => void servers.fetchServers()}
              disabled={servers.loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={servers.loading ? 'animate-spin' : ''} />
            </button>
            <Link
              href="/admin/servers/new"
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
            >
              <Plus size={16} /> Add Server
            </Link>
          </>
        }
      />

      <SectionCard contentClassName="p-0">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-5 sm:grid-cols-3 dark:border-slate-800">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
            <p className="text-xs font-medium text-slate-500">Total servers</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {servers.servers.length}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <ShieldCheck size={14} /> Verified
            </div>
            <p className="mt-1 text-2xl font-semibold text-emerald-800">{servers.verifiedCount}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
              <AlertTriangle size={14} /> Pending verification
            </div>
            <p className="mt-1 text-2xl font-semibold text-amber-800">{servers.unverifiedCount}</p>
          </div>
        </div>
      </SectionCard>

      {servers.error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{servers.error}</span>
        </div>
      )}

      {!servers.loading && servers.servers.length === 0 && !servers.error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center shadow-theme-xs">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
            <Server size={28} className="text-brand-500" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">No servers yet</h3>
          <p className="mt-2 max-w-xs text-sm text-slate-500">
            Add a VPS and choose manual or SSH verification workflow.
          </p>
          <Link
            href="/admin/servers/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
          >
            <Plus size={16} /> Add Server
          </Link>
        </div>
      )}

      {!servers.loading && servers.servers.length > 0 && (
        <div className="space-y-3">
          {servers.servers.map((server) => {
            const checklist = servers.getChecklist(server);
            const installOptions = servers.getInstallOptions(server);
            const jobs = servers.jobsByServer[server.id] ?? [];
            const jobsLoading = Boolean(servers.loadingJobsByServer[server.id]);
            const isBusy =
              servers.verifyingId === server.id ||
              servers.installingId === server.id ||
              servers.deletingId === server.id ||
              servers.savingManualId === server.id ||
              servers.registeringId === server.id ||
              jobsLoading;

            return (
              <ServerCard
                key={server.id}
                server={server}
                checklist={checklist}
                installOptions={installOptions}
                jobs={jobs}
                jobsLoading={jobsLoading}
                isBusy={isBusy}
                verifyingId={servers.verifyingId}
                installingId={servers.installingId}
                deletingId={servers.deletingId}
                savingManualId={servers.savingManualId}
                registeringId={servers.registeringId}
                retryingJobId={servers.retryingJobId}
                formatConnectionMode={servers.formatConnectionMode}
                formatJobType={servers.formatJobType}
                canRetryJob={servers.canRetryJob}
                getJobStatusClassName={servers.getJobStatusClassName}
                onVerify={servers.handleVerify}
                onOpenRunner={servers.openRunnerModal}
                onDelete={servers.handleDelete}
                onInstallOptionChange={servers.handleInstallOptionChange}
                onInstall={servers.handleInstall}
                onChecklistChange={servers.handleChecklistChange}
                onManualSave={servers.handleManualSave}
                onMarkReady={servers.handleMarkReady}
                onRefreshJobs={servers.refreshJobs}
                onRetryJob={servers.handleRetryJob}
              />
            );
          })}
        </div>
      )}

      <ServerRunnerModal
        openServerId={servers.runnerModal}
        gitlabUrl={servers.runnerGitlabUrl}
        onGitlabUrlChange={servers.setRunnerGitlabUrl}
        token={servers.runnerToken}
        onTokenChange={servers.setRunnerToken}
        error={servers.runnerError}
        registeringId={servers.registeringId}
        onClose={servers.closeRunnerModal}
        onSubmit={servers.handleRegisterRunner}
      />

      <div className="pointer-events-none fixed right-4 top-4 z-[100] space-y-2">
        {servers.toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

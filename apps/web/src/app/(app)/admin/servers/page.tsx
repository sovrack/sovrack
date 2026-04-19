'use client';

import Link from 'next/link';
import { Plus, RefreshCw, Server, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { ServerCard } from '@/components/servers/server-card';
import { ServerRunnerModal } from '@/components/servers/server-runner-modal';
import { useServerActions } from '@/hooks/useServerActions';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/ui/pagination';

export default function AdminServersPage() {
  const servers = useServerActions();
  const { page, totalPages, paged: pagedServers, goToPage } = usePagination(servers.servers, { pageSize: 10 });

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

      {servers.error && <Alert tone="error">{servers.error}</Alert>}

      {!servers.loading && servers.servers.length === 0 && !servers.error && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white shadow-theme-xs">
          <EmptyState
            icon={Server}
            title="No servers yet"
            description="Add a VPS and choose manual or SSH verification workflow."
            action={
              <Link
                href="/admin/servers/new"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
              >
                <Plus size={16} /> Add Server
              </Link>
            }
          />
        </div>
      )}

      {!servers.loading && servers.servers.length > 0 && (
        <div className="space-y-3">
          {pagedServers.map((server) => {
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
          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} className="mt-2" />
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

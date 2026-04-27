'use client';

import { useState } from 'react';
import { Plus, RefreshCw, Server } from 'lucide-react';
import type { Server as ServerType } from '@/types/server';
import { getApiErrorMessage } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { ServerCard } from '@/components/servers/server-card';
import { ServerDetailsDialog } from '@/components/servers/server-details-dialog';
import { ServerKeyInstallDialog } from '@/components/servers/server-key-install-dialog';
import { ServerPrepareDialog } from '@/components/servers/server-prepare-dialog';
import {
  ServerUpsertDialog,
  type CreateServerOptions,
} from '@/components/servers/server-upsert-dialog';
import { useServerActions } from '@/hooks/useServerActions';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/ui/pagination';

export default function AdminServersPage() {
  const servers = useServerActions();

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editServer, setEditServer] = useState<ServerType | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [installKeyServer, setInstallKeyServer] = useState<ServerType | null>(null);
  const [installKeyError, setInstallKeyError] = useState<string | null>(null);
  const [prepareServer, setPrepareServer] = useState<ServerType | null>(null);
  const [detailsServer, setDetailsServer] = useState<ServerType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerType | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    page,
    totalPages,
    paged: pagedServers,
    goToPage,
  } = usePagination(servers.servers, { pageSize: 10 });

  const resolveLiveServer = (target: ServerType | null): ServerType | null => {
    if (!target) return null;
    return servers.servers.find((item) => item.id === target.id) ?? target;
  };

  const getServerBusy = (target: ServerType | null): boolean => {
    if (!target) return false;
    return (
      servers.verifyingId === target.id ||
      servers.detectingId === target.id ||
      servers.preparingId === target.id ||
      servers.installingKeyId === target.id ||
      servers.deletingId === target.id ||
      servers.updatingId === target.id ||
      Boolean(servers.loadingJobsByServer[target.id])
    );
  };

  const activePrepareServer = resolveLiveServer(prepareServer);
  const activeDetailsServer = resolveLiveServer(detailsServer);
  const activePrepareOptions = activePrepareServer
    ? servers.getPrepareOptions(activePrepareServer)
    : {};
  const activeDetailsJobs = activeDetailsServer
    ? (servers.jobsByServer[activeDetailsServer.id] ?? [])
    : [];
  const activeDetailsJobsLoading = activeDetailsServer
    ? Boolean(servers.loadingJobsByServer[activeDetailsServer.id])
    : false;

  const handleCreateSubmit = async (
    payload: Parameters<typeof servers.handleCreate>[0],
    options?: CreateServerOptions,
  ) => {
    setCreateError(null);
    try {
      const created = await servers.handleCreate(payload);
      setCreateOpen(false);
      let installKeyErrorMessage: string | null = null;
      if (created.connectionMode === 'ssh' && options?.temporaryPassword) {
        try {
          await servers.handleInstallKey(created.id, options.temporaryPassword);
          return;
        } catch (error) {
          installKeyErrorMessage = getApiErrorMessage(error);
        }
      }
      if (created.connectionMode === 'ssh') {
        setInstallKeyError(installKeyErrorMessage);
        setInstallKeyServer(created);
      }
    } catch (error) {
      setCreateError(getApiErrorMessage(error));
    }
  };

  const handleUpdateSubmit = async (
    serverId: string,
    payload: Parameters<typeof servers.handleUpdate>[1],
  ) => {
    setEditError(null);
    try {
      await servers.handleUpdate(serverId, payload);
      setEditServer(null);
    } catch (error) {
      setEditError(getApiErrorMessage(error));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await servers.handleDelete(deleteTarget.id, deleteTarget.name);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(getApiErrorMessage(error));
    }
  };

  const handleInstallKeySubmit = async (serverId: string, password: string) => {
    setInstallKeyError(null);
    try {
      await servers.handleInstallKey(serverId, password);
      setInstallKeyServer(null);
    } catch (error) {
      setInstallKeyError(getApiErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infrastructure"
        title="Servers"
        description="Manage VPS onboarding, SSH validation, capability detection and Ansible preparation from the control node. VPS targets do not install Ansible."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} className={servers.loading ? 'animate-spin' : ''} />}
              onClick={() => void servers.fetchServers()}
              disabled={servers.loading}
            >
              Refresh
            </Button>
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
            >
              Add Server
            </Button>
          </>
        }
      />

      <SectionCard contentClassName="p-0">
        <div className="grid grid-cols-1 gap-3 border-b border-[var(--border)] p-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-muted)]">Total servers</p>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {servers.servers.length}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-muted)]">SSH validated</p>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {servers.verifiedCount}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-muted)]">Needs validation</p>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {servers.unverifiedCount}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-muted)]">Prepared</p>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {servers.readyCount}
            </p>
          </div>
        </div>
      </SectionCard>

      {servers.error && <Alert tone="error">{servers.error}</Alert>}

      {!servers.loading && servers.servers.length === 0 && !servers.error && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--hover)]">
          <EmptyState
            icon={Server}
            title="No servers yet"
            description="Add your first VPS to start SSH validation and server preparation."
            action={
              <Button
                icon={<Plus size={16} />}
                onClick={() => {
                  setCreateError(null);
                  setCreateOpen(true);
                }}
              >
                Add Server
              </Button>
            }
          />
        </div>
      )}

      {!servers.loading && servers.servers.length > 0 && (
        <div className="space-y-3">
          {pagedServers.map((server) => {
            const isBusy = getServerBusy(server);

            return (
              <ServerCard
                key={server.id}
                server={server}
                isBusy={isBusy}
                verifyingId={servers.verifyingId}
                detectingId={servers.detectingId}
                preparingId={servers.preparingId}
                installingKeyId={servers.installingKeyId}
                deletingId={servers.deletingId}
                updatingId={servers.updatingId}
                formatConnectionMode={servers.formatConnectionMode}
                onVerify={servers.handleVerify}
                onDetect={servers.handleDetect}
                onInstallKey={(nextServer) => {
                  setInstallKeyError(null);
                  setInstallKeyServer(nextServer);
                }}
                onOpenPrepare={setPrepareServer}
                onOpenDetails={setDetailsServer}
                onEdit={(nextServer) => {
                  setEditError(null);
                  setEditServer(nextServer);
                }}
                onDelete={(nextServer) => {
                  setDeleteError(null);
                  setDeleteTarget(nextServer);
                }}
              />
            );
          })}

          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} className="mt-2" />
        </div>
      )}

      <ServerKeyInstallDialog
        open={Boolean(installKeyServer)}
        server={installKeyServer}
        loading={Boolean(
          installKeyServer && servers.installingKeyId === installKeyServer.id,
        )}
        error={installKeyError}
        onClose={() => {
          setInstallKeyError(null);
          setInstallKeyServer(null);
        }}
        onSubmit={handleInstallKeySubmit}
      />

      <ServerPrepareDialog
        open={Boolean(activePrepareServer)}
        server={activePrepareServer}
        prepareOptions={activePrepareOptions}
        isBusy={getServerBusy(activePrepareServer)}
        preparingId={servers.preparingId}
        onClose={() => setPrepareServer(null)}
        onFieldChange={servers.handlePrepareOptionChange}
        onPrepare={servers.handlePrepare}
      />

      <ServerDetailsDialog
        open={Boolean(activeDetailsServer)}
        server={activeDetailsServer}
        jobs={activeDetailsJobs}
        jobsLoading={activeDetailsJobsLoading}
        isBusy={getServerBusy(activeDetailsServer)}
        retryingJobId={servers.retryingJobId}
        formatJobType={servers.formatJobType}
        canRetryJob={servers.canRetryJob}
        getJobStatusClassName={servers.getJobStatusClassName}
        onClose={() => setDetailsServer(null)}
        onRefreshJobs={servers.refreshJobs}
        onRetryJob={servers.handleRetryJob}
      />

      <ServerUpsertDialog
        open={createOpen}
        mode="create"
        loading={servers.creating}
        error={createError}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateSubmit}
        onUpdate={handleUpdateSubmit}
      />

      <ServerUpsertDialog
        open={Boolean(editServer)}
        mode="edit"
        server={editServer}
        loading={Boolean(editServer && servers.updatingId === editServer.id)}
        error={editError}
        onClose={() => setEditServer(null)}
        onCreate={handleCreateSubmit}
        onUpdate={handleUpdateSubmit}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : 'Delete server?'}
        description="This action is irreversible and removes server metadata from the platform."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={Boolean(deleteTarget && servers.deletingId === deleteTarget.id)}
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
        onCancel={() => {
          setDeleteError(null);
          setDeleteTarget(null);
        }}
      >
        {deleteError && <Alert tone="error">{deleteError}</Alert>}
      </ConfirmDialog>

      <div className="pointer-events-none fixed right-4 top-4 z-[100] space-y-2">
        {servers.toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${
              toast.tone === 'success' ? 'bg-emerald-600' : 'bg-red-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

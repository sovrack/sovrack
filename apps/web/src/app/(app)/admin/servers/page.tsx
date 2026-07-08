"use client";

import { useEffect, useState } from "react";
import { Plus, Server } from "lucide-react";
import type { Server as ServerType } from "@/features/servers/types/server";
import { getApiErrorMessage } from "@/shared/lib/api";
import { Alert } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/layout/page-header";
import { ServersTable } from "@/features/servers/components/tables/servers-table";
import { useAuth } from "@/features/auth/api/use-auth";
import { ServerDetailsDialog } from "@/features/servers/components/dialogs/server-details-dialog";
import { ServerKeyInstallDialog } from "@/features/servers/components/dialogs/server-key-install-dialog";
import { ServerSetupDialog } from "@/features/servers/components/dialogs/server-setup-dialog";
import { ServerTerminalDialog } from "@/features/servers/components/dialogs/server-terminal-dialog";
import {
  ServerUpsertDialog,
  type CreateServerOptions,
} from "@/features/servers/components/dialogs/server-upsert-dialog";
import { useServerActions } from "@/features/servers/api/use-server-actions";
import { useServersReachability } from "@/features/servers/api/use-servers";
import { usePagination } from "@/shared/hooks/use-pagination";
import { Pagination } from "@/shared/ui/pagination";

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function AdminServersPage() {
  const { isAdmin } = useAuth();
  const servers = useServerActions();
  const reachabilityQuery = useServersReachability();

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editServer, setEditServer] = useState<ServerType | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [installKeyServer, setInstallKeyServer] = useState<ServerType | null>(
    null,
  );
  const [installKeyError, setInstallKeyError] = useState<string | null>(null);
  const [setupServer, setSetupServer] = useState<ServerType | null>(null);
  const [detailsServer, setDetailsServer] = useState<ServerType | null>(null);
  const [terminalServer, setTerminalServer] = useState<ServerType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerType | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    page,
    totalPages,
    paged: pagedServers,
    goToPage,
  } = usePagination(servers.servers, { pageSize: 10 });

  // Rafraîchit la LISTE des serveurs (léger : pas de ping SSH) toutes les 60 s,
  // pour refléter l'avancement des jobs sans marteler les connexions.
  useEffect(() => {
    const id = setInterval(() => {
      void servers.fetchServers();
    }, 60_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resolveLiveServer = (target: ServerType | null) =>
    target ? (servers.servers.find((s) => s.id === target.id) ?? target) : null;

  const getServerBusy = (target: ServerType | null): boolean => {
    if (!target) return false;
    return (
      [
        servers.verifyingId,
        servers.detectingId,
        servers.settingUpId,
        servers.installingKeyId,
        servers.deletingId,
        servers.updatingId,
      ].includes(target.id) || Boolean(servers.loadingJobsByServer[target.id])
    );
  };

  const activeSetupServer = resolveLiveServer(setupServer);
  const activeDetailsServer = resolveLiveServer(detailsServer);
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
      if (created.connectionMode === "ssh" && options?.temporaryPassword) {
        try {
          await servers.handleInstallKey(created.id, options.temporaryPassword);
          return;
        } catch (error) {
          installKeyErrorMessage = getApiErrorMessage(error);
        }
      }
      if (created.connectionMode === "ssh") {
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
        title="Remote Servers"
        description="Manage your VPS servers — SSH validation, capability detection, Ansible provisioning and environment assignment."
        actions={
          isAdmin ? (
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
            >
              Add Server
            </Button>
          ) : undefined
        }
      />

      {servers.error && <Alert tone="error">{servers.error}</Alert>}

      {!servers.loading && servers.servers.length === 0 && !servers.error && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--hover)]">
          <EmptyState
            icon={Server}
            title="No servers"
            description="Add your first VPS to start SSH validation and provisioning."
            action={
              isAdmin ? (
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setCreateError(null);
                    setCreateOpen(true);
                  }}
                >
                  Add Server
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {!servers.loading && servers.servers.length > 0 && (
        <div className="space-y-3">
          <ServersTable
            readOnly={!isAdmin}
            servers={pagedServers}
            isReachable={reachabilityQuery.data ?? {}}
            getServerBusy={getServerBusy}
            onOpenTerminal={setTerminalServer}
            onOpenSetup={setSetupServer}
            onOpenDetails={setDetailsServer}
            onEdit={(s) => {
              setEditError(null);
              setEditServer(s);
            }}
            onDelete={(s) => {
              setDeleteError(null);
              setDeleteTarget(s);
            }}
            onValidateSsh={(s: ServerType) => servers.handleVerify(s.id)}
          />

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={goToPage}
            className="mt-2"
          />
        </div>
      )}

      {/* ─── Environments tab ─── */}

      {/* ─── Overview tab ─── */}

      {/* ─── Dialogs ─── */}
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

      <ServerSetupDialog
        open={Boolean(activeSetupServer)}
        server={activeSetupServer}
        isBusy={getServerBusy(activeSetupServer)}
        settingUpId={servers.settingUpId}
        onVerify={(s) => servers.handleVerify(s.id)}
        verifyingId={servers.verifyingId}
        onClose={() => setSetupServer(null)}
        onStartSetup={servers.handleStartSetup}
      />

      <ServerDetailsDialog
        open={Boolean(activeDetailsServer)}
        server={activeDetailsServer}
        jobs={activeDetailsJobs}
        jobsLoading={activeDetailsJobsLoading}
        isBusy={getServerBusy(activeDetailsServer)}
        retryingJobId={servers.retryingJobId}
        cancelingJobId={servers.cancelingJobId}
        formatJobType={servers.formatJobType}
        canRetryJob={servers.canRetryJob}
        canCancelJob={servers.canCancelJob}
        getJobStatusClassName={servers.getJobStatusClassName}
        onClose={() => setDetailsServer(null)}
        onRefreshJobs={servers.refreshJobs}
        onRetryJob={servers.handleRetryJob}
        onCancelJob={servers.handleCancelJob}
      />

      <ServerTerminalDialog
        open={Boolean(terminalServer)}
        server={terminalServer}
        onClose={() => setTerminalServer(null)}
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
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete server?"}
        description="This action cannot be undone — deletes the server and its metadata."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={Boolean(
          deleteTarget && servers.deletingId === deleteTarget.id,
        )}
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

    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Container,
  GitMerge,
  HelpCircle,
  Plus,
  Server,
} from "lucide-react";
import clsx from "clsx";
import type { Server as ServerType } from "@/features/servers/types/server";
import { getApiErrorMessage } from "@/shared/lib/api";
import { Alert } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/layout/page-header";
import { ServerCard } from "@/features/servers/components/cards/server-card";
import { ServerDetailsDialog } from "@/features/servers/components/dialogs/server-details-dialog";
import { ServerKeyInstallDialog } from "@/features/servers/components/dialogs/server-key-install-dialog";
import { ServerPrepareDialog } from "@/features/servers/components/dialogs/server-prepare-dialog";
import {
  ServerUpsertDialog,
  type CreateServerOptions,
} from "@/features/servers/components/dialogs/server-upsert-dialog";
import { useServerActions } from "@/features/servers/api/use-server-actions";
import {
  useInstalledTools,
  useServersReachability,
} from "@/features/servers/api/use-servers";
import { usePagination } from "@/shared/hooks/use-pagination";
import { Pagination } from "@/shared/ui/pagination";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type ServerRole = "APP" | "CI_RUNNER" | "APP_CI" | "GENERAL";

function deriveRole(s: ServerType): ServerRole {
  if (s.hasDocker && s.hasRunner) return "APP_CI";
  if (s.hasDocker) return "APP";
  if (s.hasRunner) return "CI_RUNNER";
  return "GENERAL";
}

const ROLE_META: Record<
  ServerRole,
  { label: string; color: string; icon: React.ReactNode }
> = {
  APP: {
    label: "App Server",
    color: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    icon: <Container size={10} />,
  },
  CI_RUNNER: {
    label: "CI Runner",
    color: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
    icon: <GitMerge size={10} />,
  },
  APP_CI: {
    label: "App + CI",
    color: "border-green-500/20 bg-green-500/10 text-green-400",
    icon: <Activity size={10} />,
  },
  GENERAL: {
    label: "General",
    color: "border-[var(--border)] bg-[var(--hover)] text-[var(--text-muted)]",
    icon: <HelpCircle size={10} />,
  },
};

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function AdminServersPage() {
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
  const [prepareServer, setPrepareServer] = useState<ServerType | null>(null);
  const prepareToolsQuery = useInstalledTools(prepareServer?.id ?? "");
  const [detailsServer, setDetailsServer] = useState<ServerType | null>(null);
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
        servers.preparingId,
        servers.installingKeyId,
        servers.deletingId,
        servers.updatingId,
      ].includes(target.id) || Boolean(servers.loadingJobsByServer[target.id])
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

      {servers.error && <Alert tone="error">{servers.error}</Alert>}

      {!servers.loading && servers.servers.length === 0 && !servers.error && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--hover)]">
          <EmptyState
            icon={Server}
            title="No servers"
            description="Add your first VPS to start SSH validation and provisioning."
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
        <>
          <div className="space-y-3">
            {pagedServers.map((server) => {
              const isBusy = getServerBusy(server);
              return (
                <div
                  key={server.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] transition hover:shadow-sm"
                >
                  {/* Role badge strip */}
                  {server.lastDetectedAt && (
                    <div className="flex items-center justify-end border-b border-[var(--border)] px-5 py-2">
                      <span
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                          ROLE_META[deriveRole(server)].color,
                        )}
                      >
                        {ROLE_META[deriveRole(server)].icon}
                        {ROLE_META[deriveRole(server)].label}
                      </span>
                    </div>
                  )}

                  {/* Server card content */}
                  <div className="p-4">
                    <ServerCard
                      server={server}
                      isReachable={reachabilityQuery.data?.[server.id]}
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
                      onInstallKey={(s) => {
                        setInstallKeyError(null);
                        setInstallKeyServer(s);
                      }}
                      onOpenPrepare={setPrepareServer}
                      onOpenDetails={setDetailsServer}
                      onEdit={(s) => {
                        setEditError(null);
                        setEditServer(s);
                      }}
                      onDelete={(s) => {
                        setDeleteError(null);
                        setDeleteTarget(s);
                      }}
                    />
                  </div>

                </div>
              );
            })}

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={goToPage}
              className="mt-2"
            />
          </div>
        </>
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

      <ServerPrepareDialog
        open={Boolean(activePrepareServer)}
        server={activePrepareServer}
        prepareOptions={activePrepareOptions}
        isBusy={getServerBusy(activePrepareServer)}
        preparingId={servers.preparingId}
        installedTools={prepareToolsQuery.data ?? []}
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

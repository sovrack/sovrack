'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Container,
  GitMerge,
  HelpCircle,
  Loader2,
  Plus,
  Server,
  ShieldCheck,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import type { Server as ServerType } from '@/features/servers/types/server';
import { serversService } from '@/features/servers/api/servers.service';
import { getApiErrorMessage } from '@/shared/lib/api';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/layout/page-header';
import { ServerCard } from '@/features/servers/components/server-card';
import { ServerDetailsDialog } from '@/features/servers/components/server-details-dialog';
import { ServerLogsDialog } from '@/features/servers/components/server-logs-dialog';
import { ServerKeyInstallDialog } from '@/features/servers/components/server-key-install-dialog';
import { ServerPrepareDialog } from '@/features/servers/components/server-prepare-dialog';
import {
  ServerUpsertDialog,
  type CreateServerOptions,
} from '@/features/servers/components/server-upsert-dialog';
import { useServerActions } from '@/features/servers/api/use-server-actions';
import { useInstalledTools } from '@/features/servers/api/use-servers';
import { usePagination } from '@/shared/hooks/use-pagination';
import { Pagination } from '@/shared/ui/pagination';

/* ─── Types ─────────────────────────────────────────────────────────────── */

type PingResult = { ok: boolean; message: string };
type PingMap = Record<string, PingResult | 'loading'>;

type ServerRole = 'APP' | 'CI_RUNNER' | 'APP_CI' | 'GENERAL';

function deriveRole(s: ServerType): ServerRole {
  if (s.hasDocker && s.hasRunner) return 'APP_CI';
  if (s.hasDocker) return 'APP';
  if (s.hasRunner) return 'CI_RUNNER';
  return 'GENERAL';
}

const ROLE_META: Record<ServerRole, { label: string; color: string; icon: React.ReactNode }> = {
  APP: { label: 'App Server', color: 'border-blue-500/20 bg-blue-500/10 text-blue-400', icon: <Container size={10} /> },
  CI_RUNNER: { label: 'CI Runner', color: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400', icon: <GitMerge size={10} /> },
  APP_CI: { label: 'App + CI', color: 'border-green-500/20 bg-green-500/10 text-green-400', icon: <Activity size={10} /> },
  GENERAL: { label: 'General', color: 'border-[var(--border)] bg-[var(--hover)] text-[var(--text-muted)]', icon: <HelpCircle size={10} /> },
};

/* ─── Connection status badge ─────────────────────────────────────────────── */

function ConnectionBadge({ server, ping }: { server: ServerType; ping?: PingResult | 'loading' }) {
  if (ping === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
        <Loader2 size={9} className="animate-spin" /> Testing…
      </span>
    );
  }

  if (ping) {
    return ping.ok ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
        <Wifi size={9} /> Connected
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400" title={ping.message}>
        <WifiOff size={9} /> Unreachable
      </span>
    );
  }

  if (server.isVerified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
        <ShieldCheck size={9} /> SSH OK
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
      <XCircle size={9} /> Not verified
    </span>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function AdminServersPage() {
  const servers = useServerActions();
  const [pingMap, setPingMap] = useState<PingMap>({});
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editServer, setEditServer] = useState<ServerType | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [installKeyServer, setInstallKeyServer] = useState<ServerType | null>(null);
  const [installKeyError, setInstallKeyError] = useState<string | null>(null);
  const [prepareServer, setPrepareServer] = useState<ServerType | null>(null);
  const prepareToolsQuery = useInstalledTools(prepareServer?.id ?? '');
  const [detailsServer, setDetailsServer] = useState<ServerType | null>(null);
  const [logsServer, setLogsServer] = useState<ServerType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerType | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { page, totalPages, paged: pagedServers, goToPage } = usePagination(servers.servers, { pageSize: 10 });

  // PAS d'auto-ping au montage : on n'inonde plus les serveurs de tests SSH à
  // chaque visite (l'ancienne « tempête de ping » donnait l'impression qu'il
  // fallait toujours re-vérifier la connexion). Le badge affiche le DERNIER
  // état connu (SSH vérifié, en cache via server.isVerified/lastVerifiedAt) ;
  // l'utilisateur lance une vérification À LA DEMANDE avec le bouton « Test ».

  // Rafraîchit la LISTE des serveurs (léger : pas de ping SSH) toutes les 60 s,
  // pour refléter l'avancement des jobs sans marteler les connexions.
  useEffect(() => {
    const id = setInterval(() => { void servers.fetchServers(); }, 60_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Vérification EN MASSE, mais À LA DEMANDE (clic) — pas au montage. Remplace
  // l'ancien auto-ping : l'utilisateur décide quand re-tester toutes les connexions.
  const handleTestAll = async () => {
    const toTest = servers.servers.filter((s) => s.isVerified || s.lastVerifiedAt);
    if (toTest.length === 0) return;
    setTestingAll(true);
    setPingMap((prev) => {
      const next = { ...prev };
      for (const s of toTest) next[s.id] = 'loading';
      return next;
    });
    await Promise.allSettled(
      toTest.map(async (s) => {
        try {
          const result = await serversService.ping(s.id);
          setPingMap((prev) => ({ ...prev, [s.id]: { ok: result.ok, message: result.message } }));
        } catch {
          setPingMap((prev) => ({ ...prev, [s.id]: { ok: false, message: 'Connection error' } }));
        }
      }),
    );
    setTestingAll(false);
  };

  const handlePing = async (server: ServerType) => {
    setPingingId(server.id);
    setPingMap((prev) => ({ ...prev, [server.id]: 'loading' }));
    try {
      const result = await serversService.ping(server.id);
      setPingMap((prev) => ({ ...prev, [server.id]: { ok: result.ok, message: result.message } }));
      // Refresh server list to get updated status
      await servers.fetchServers();
    } catch (e) {
      setPingMap((prev) => ({ ...prev, [server.id]: { ok: false, message: getApiErrorMessage(e) } }));
    } finally {
      setPingingId(null);
    }
  };

  const resolveLiveServer = (target: ServerType | null) =>
    target ? (servers.servers.find((s) => s.id === target.id) ?? target) : null;

  const getServerBusy = (target: ServerType | null): boolean => {
    if (!target) return false;
    return [
      servers.verifyingId, servers.detectingId, servers.preparingId,
      servers.installingKeyId, servers.deletingId, servers.updatingId,
    ].includes(target.id) || Boolean(servers.loadingJobsByServer[target.id]);
  };

  const activePrepareServer = resolveLiveServer(prepareServer);
  const activeDetailsServer = resolveLiveServer(detailsServer);
  const activePrepareOptions = activePrepareServer ? servers.getPrepareOptions(activePrepareServer) : {};
  const activeDetailsJobs = activeDetailsServer ? (servers.jobsByServer[activeDetailsServer.id] ?? []) : [];
  const activeDetailsJobsLoading = activeDetailsServer ? Boolean(servers.loadingJobsByServer[activeDetailsServer.id]) : false;

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

  const handleUpdateSubmit = async (serverId: string, payload: Parameters<typeof servers.handleUpdate>[1]) => {
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
        description="Manage your VPS servers — SSH validation, capability detection, Ansible provisioning and environment assignment. Connection status is cached; run a check on demand (Test)."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Wifi size={16} />}
              loading={testingAll}
              onClick={() => void handleTestAll()}
            >
              Test all
            </Button>
            <Button icon={<Plus size={16} />} onClick={() => { setCreateError(null); setCreateOpen(true); }}>
              Add Server
            </Button>
          </>
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
              <Button icon={<Plus size={16} />} onClick={() => { setCreateError(null); setCreateOpen(true); }}>
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
                const ping = pingMap[server.id];
                const isBusy = getServerBusy(server);
                return (
                  <div key={server.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] transition hover:shadow-sm">
                    {/* Connection status bar */}
                    <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-2">
                      <ConnectionBadge server={server} ping={ping} />
                      <div className="flex items-center gap-2">
                        {server.lastDetectedAt && (
                          <span className={clsx(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                            ROLE_META[deriveRole(server)].color,
                          )}>
                            {ROLE_META[deriveRole(server)].icon}
                            {ROLE_META[deriveRole(server)].label}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={pingingId === server.id || ping === 'loading'}
                          onClick={() => void handlePing(server)}
                          title="Test connection"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-400 disabled:opacity-40"
                        >
                          {pingingId === server.id || ping === 'loading' ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : ping && typeof ping === 'object' && ping.ok ? (
                            <CheckCircle2 size={10} className="text-green-400" />
                          ) : (
                            <Wifi size={10} />
                          )}
                          Test
                        </button>
                      </div>
                    </div>

                    {/* Server card content */}
                    <div className="p-4">
                      <ServerCard
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
                        onInstallKey={(s) => { setInstallKeyError(null); setInstallKeyServer(s); }}
                        onOpenPrepare={setPrepareServer}
                        onOpenDetails={setDetailsServer}
                        onOpenLogs={setLogsServer}
                        onEdit={(s) => { setEditError(null); setEditServer(s); }}
                        onDelete={(s) => { setDeleteError(null); setDeleteTarget(s); }}
                      />
                    </div>

                    {/* Ping result message */}
                    {ping && ping !== 'loading' && !ping.ok && (
                      <div className="border-t border-red-500/10 bg-red-500/5 px-5 py-2 text-xs text-red-400">
                        {ping.message}
                      </div>
                    )}
                  </div>
                );
              })}

              <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} className="mt-2" />
            </div>
        </>
      )}

      {/* ─── Environments tab ─── */}

      {/* ─── Overview tab ─── */}

      {/* ─── Dialogs ─── */}
      <ServerKeyInstallDialog
        open={Boolean(installKeyServer)}
        server={installKeyServer}
        loading={Boolean(installKeyServer && servers.installingKeyId === installKeyServer.id)}
        error={installKeyError}
        onClose={() => { setInstallKeyError(null); setInstallKeyServer(null); }}
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

      <ServerLogsDialog
        open={Boolean(logsServer)}
        serverId={logsServer?.id ?? null}
        serverName={logsServer?.name}
        onClose={() => setLogsServer(null)}
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
        description="This action cannot be undone — deletes the server and its metadata."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={Boolean(deleteTarget && servers.deletingId === deleteTarget.id)}
        onConfirm={() => { void handleDeleteConfirm(); }}
        onCancel={() => { setDeleteError(null); setDeleteTarget(null); }}
      >
        {deleteError && <Alert tone="error">{deleteError}</Alert>}
      </ConfirmDialog>

      {/* Toasts */}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] space-y-2">
        {servers.toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${toast.tone === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

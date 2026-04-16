'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Server,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Zap,
  ShieldCheck,
  AlertTriangle,
  Save,
  Wrench,
  RotateCcw,
  Play,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { serversService } from '@/services/servers.service';
import { getApiErrorMessage } from '@/lib/api';
import { ServerStatusBadges } from '@/components/servers/server-status-badges';
import type { Server as ServerType, ServerJob } from '@/types/server';

type ManualChecklist = Pick<
  ServerType,
  'isVerified' | 'hasDocker' | 'hasAnsible' | 'hasRunner'
>;

type InstallOptions = {
  docker: boolean;
  ansible: boolean;
  runner: boolean;
};

type ToastTone = 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };

export default function AdminServersPage() {
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingManualId, setSavingManualId] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [loadingJobsByServer, setLoadingJobsByServer] = useState<
    Record<string, boolean>
  >({});
  const [jobsByServer, setJobsByServer] = useState<Record<string, ServerJob[]>>(
    {},
  );
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [manualDrafts, setManualDrafts] = useState<
    Record<string, ManualChecklist>
  >({});
  const [installDrafts, setInstallDrafts] = useState<
    Record<string, InstallOptions>
  >({});

  // Système de toasts de notification
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // État du modal d'enregistrement GitLab Runner
  const [runnerModal, setRunnerModal] = useState<string | null>(null);
  const [runnerGitlabUrl, setRunnerGitlabUrl] = useState('');
  const [runnerToken, setRunnerToken] = useState('');
  const [runnerError, setRunnerError] = useState<string | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextServers = await serversService.getAll();
      setServers(nextServers);

      await Promise.all(
        nextServers.map(async (server) => {
          try {
            const jobs = await serversService.getJobs(server.id);
            setJobsByServer((prev) => ({ ...prev, [server.id]: jobs }));
          } catch {
            // Pas bloquant pour le listing principal.
          }
        }),
      );
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchServers(); }, [fetchServers]);

  const clearManualDraft = (serverId: string) => {
    setManualDrafts((prev) => {
      const next = { ...prev };
      delete next[serverId];
      return next;
    });
  };

  const clearInstallDraft = (serverId: string) => {
    setInstallDrafts((prev) => {
      const next = { ...prev };
      delete next[serverId];
      return next;
    });
  };

  const refreshJobs = async (serverId: string) => {
    setLoadingJobsByServer((prev) => ({ ...prev, [serverId]: true }));
    try {
      const jobs = await serversService.getJobs(serverId);
      setJobsByServer((prev) => ({ ...prev, [serverId]: jobs }));
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setLoadingJobsByServer((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      const result = await serversService.verify(id);
      setServers((prev) =>
        prev.map((s) => s.id === id ? { ...s, ...result } : s),
      );
      clearManualDraft(id);
      showToast('Vérification SSH réussie', 'success');
      await refreshJobs(id);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setVerifyingId(null);
    }
  };

  const getChecklist = (server: ServerType): ManualChecklist => {
    return (
      manualDrafts[server.id] ?? {
        isVerified: server.isVerified,
        hasDocker: server.hasDocker,
        hasAnsible: server.hasAnsible,
        hasRunner: server.hasRunner,
      }
    );
  };

  const handleChecklistChange = (
    server: ServerType,
    field: keyof ManualChecklist,
    value: boolean,
  ) => {
    const current = getChecklist(server);
    setManualDrafts((prev) => ({
      ...prev,
      [server.id]: {
        ...current,
        [field]: value,
      },
    }));
  };

  const getInstallOptions = (server: ServerType): InstallOptions => {
    return (
      installDrafts[server.id] ?? {
        docker: !server.hasDocker,
        ansible: !server.hasAnsible,
        runner: !server.hasRunner,
      }
    );
  };

  const handleInstallOptionChange = (
    server: ServerType,
    field: keyof InstallOptions,
    value: boolean,
  ) => {
    const current = getInstallOptions(server);
    setInstallDrafts((prev) => ({
      ...prev,
      [server.id]: {
        ...current,
        [field]: value,
      },
    }));
  };

  const handleInstall = async (server: ServerType) => {
    const payload = getInstallOptions(server);
    const hasSelection = payload.docker || payload.ansible || payload.runner;

    if (!hasSelection) {
      showToast('Sélectionnez au moins un outil à installer.', 'error');
      return;
    }

    setInstallingId(server.id);
    try {
      const updated = await serversService.install(server.id, payload);
      setServers((prev) => prev.map((s) => (s.id === server.id ? updated : s)));
      clearManualDraft(server.id);
      clearInstallDraft(server.id);
      showToast('Installation terminée avec succès', 'success');
      await refreshJobs(server.id);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setInstallingId(null);
    }
  };

  const handleManualSave = async (server: ServerType) => {
    const payload = getChecklist(server);
    setSavingManualId(server.id);
    try {
      const updated = await serversService.update(server.id, payload);
      setServers((prev) => prev.map((s) => (s.id === server.id ? updated : s)));
      clearManualDraft(server.id);
      showToast('Statut mis à jour manuellement', 'success');
      await refreshJobs(server.id);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setSavingManualId(null);
    }
  };

  const handleMarkReady = async (server: ServerType) => {
    const payload: ManualChecklist = {
      isVerified: true,
      hasDocker: true,
      hasAnsible: true,
      hasRunner: true,
    };
    setSavingManualId(server.id);
    try {
      const updated = await serversService.update(server.id, payload);
      setServers((prev) => prev.map((s) => (s.id === server.id ? updated : s)));
      clearManualDraft(server.id);
      showToast('Serveur marqué prêt', 'success');
      await refreshJobs(server.id);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setSavingManualId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer le serveur "${name}" ? Cette action est irréversible.`)) return;
    setDeletingId(id);
    try {
      await serversService.remove(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
      showToast(`Serveur "${name}" supprimé`, 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRetryJob = async (serverId: string, jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const updated = await serversService.retryJob(serverId, jobId);
      setServers((prev) => prev.map((s) => (s.id === serverId ? updated : s)));
      showToast('Job relancé avec succès', 'success');
      await refreshJobs(serverId);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setRetryingJobId(null);
    }
  };

  // Enregistrement du GitLab Runner via modal
  const handleRegisterRunner = async (serverId: string) => {
    if (!runnerGitlabUrl.trim() || !runnerToken.trim()) {
      setRunnerError("L'URL GitLab et le token sont obligatoires");
      return;
    }
    setRegisteringId(serverId);
    setRunnerError(null);
    try {
      const updated = await serversService.registerRunner(serverId, {
        gitlabUrl: runnerGitlabUrl.trim(),
        token: runnerToken.trim(),
      });
      setServers((prev) => prev.map((s) => (s.id === serverId ? updated : s)));
      setRunnerModal(null);
      setRunnerGitlabUrl('');
      setRunnerToken('');
      showToast('Runner GitLab enregistré avec succès', 'success');
      await refreshJobs(serverId);
    } catch (err) {
      setRunnerError(getApiErrorMessage(err));
    } finally {
      setRegisteringId(null);
    }
  };

  const formatConnectionMode = (mode: ServerType['connectionMode']) => {
    if (mode === 'bastion') return 'Bastion';
    if (mode === 'agent') return 'Agent';
    return 'SSH';
  };

  const formatJobType = (type: ServerJob['type']) => {
    if (type === 'INSTALL_TOOLS') return 'Install Tools';
    if (type === 'REGISTER_RUNNER') return 'Register Runner';
    return 'Verify';
  };

  const canRetryJob = (job: ServerJob) => {
    const retryableStatuses: ServerJob['status'][] = [
      'FAILED',
      'TIMEOUT',
      'BLOCKED',
    ];
    if (!retryableStatuses.includes(job.status)) {
      return false;
    }
    return job.type !== 'REGISTER_RUNNER';
  };

  const getJobStatusClassName = (status: ServerJob['status']) => {
    if (status === 'SUCCESS') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    if (status === 'FAILED' || status === 'TIMEOUT' || status === 'BLOCKED') {
      return 'border-red-200 bg-red-50 text-red-700';
    }
    if (status === 'RUNNING') {
      return 'border-blue-200 bg-blue-50 text-blue-700';
    }
    if (status === 'AGENT_PENDING') {
      return 'border-violet-200 bg-violet-50 text-violet-700';
    }
    return 'border-slate-200 bg-slate-100 text-slate-600';
  };

  const verifiedCount = servers.filter((s) => s.isVerified).length;
  const unverifiedCount = servers.length - verifiedCount;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infrastructure"
        title="Servers"
        description="Configure servers with manual checklist updates or SSH auto-verification before linking them to environments."
        actions={
          <>
            <button
              onClick={() => void fetchServers()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
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
              {servers.length}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <ShieldCheck size={14} />
              Verified
            </div>
            <p className="mt-1 text-2xl font-semibold text-emerald-800">
              {verifiedCount}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
              <AlertTriangle size={14} />
              Pending verification
            </div>
            <p className="mt-1 text-2xl font-semibold text-amber-800">
              {unverifiedCount}
            </p>
          </div>
        </div>
      </SectionCard>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex gap-4">
                <div className="h-10 w-10 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-3 w-24 rounded bg-slate-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && servers.length === 0 && !error && (
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

      {!loading && servers.length > 0 && (
        <div className="space-y-3">
          {servers.map((server) => {
            const checklist = getChecklist(server);
            const installOptions = getInstallOptions(server);
            const jobs = jobsByServer[server.id] ?? [];
            const jobsLoading = Boolean(loadingJobsByServer[server.id]);
            const hasInstallSelection =
              installOptions.docker ||
              installOptions.ansible ||
              installOptions.runner;
            const isBusy =
              verifyingId === server.id ||
              installingId === server.id ||
              deletingId === server.id ||
              savingManualId === server.id ||
              registeringId === server.id ||
              jobsLoading;

            return (
              <div
                key={server.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:border-slate-300 hover:shadow-theme-lg"
              >
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${server.isVerified ? 'bg-emerald-50' : 'bg-slate-100'}`}
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
                            <CheckCircle size={10} />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            <XCircle size={10} />
                            Not verified
                          </span>
                        )}
                        {/* Onboarding Step Badge */}
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          server.onboardingStep === 'PENDING' ? 'border-red-200 bg-red-50 text-red-700' :
                          server.onboardingStep === 'KEY_INSTALLED' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                          server.onboardingStep === 'VALIDATED' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                          server.onboardingStep === 'READY' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                          'border-slate-200 bg-slate-50 text-slate-500'
                        }`}>
                          {server.onboardingStep === 'PENDING' && '🔴'}
                          {server.onboardingStep === 'KEY_INSTALLED' && '🟠'}
                          {server.onboardingStep === 'VALIDATED' && '🔵'}
                          {server.onboardingStep === 'READY' && '🟢'}
                          {server.onboardingStep === 'PENDING' && 'Non config'}
                          {server.onboardingStep === 'KEY_INSTALLED' && 'Clé inst'}
                          {server.onboardingStep === 'VALIDATED' && 'Validé'}
                          {server.onboardingStep === 'READY' && 'Prêt'}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-slate-400">
                        {server.username}@{server.host}:{server.port}
                      </p>
                      {/* Date d'ajout du serveur */}
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
                              ? `Last seen ${new Date(
                                  server.agentLastSeenAt,
                                ).toLocaleString()}`
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

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      onClick={() => void handleVerify(server.id)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {verifyingId === server.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Zap size={13} className="text-brand-500" />
                      )}
                      {server.connectionMode === 'agent'
                        ? 'Queue verify'
                        : 'Verify SSH'}
                    </button>

                    {/* Bouton Register Runner — visible uniquement si Docker est installé */}
                    {server.hasDocker && (
                      <button
                        onClick={() => {
                          setRunnerModal(server.id);
                          setRunnerGitlabUrl('');
                          setRunnerToken('');
                          setRunnerError(null);
                        }}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
                      >
                        {registeringId === server.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Play size={13} />
                        )}
                        Register Runner
                      </button>
                    )}

                    <button
                      onClick={() => void handleDelete(server.id, server.name)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === server.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                    {server.connectionMode === 'agent'
                      ? 'Agent Automation'
                      : 'SSH Automation'}
                  </p>
                  <p className="mt-1 text-xs text-blue-700/80">
                    {server.connectionMode === 'agent'
                      ? 'Actions are queued and executed when the agent pulls pending jobs.'
                      : 'Install missing tools remotely from this interface.'}
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={installOptions.docker}
                        onChange={(e) =>
                          handleInstallOptionChange(server, 'docker', e.target.checked)
                        }
                        disabled={isBusy}
                      />
                      Docker
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={installOptions.ansible}
                        onChange={(e) =>
                          handleInstallOptionChange(server, 'ansible', e.target.checked)
                        }
                        disabled={isBusy}
                      />
                      Ansible
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={installOptions.runner}
                        onChange={(e) =>
                          handleInstallOptionChange(server, 'runner', e.target.checked)
                        }
                        disabled={isBusy}
                      />
                      GitLab Runner
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void handleInstall(server)}
                      disabled={isBusy || !hasInstallSelection}
                      className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                    >
                      {installingId === server.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Wrench size={13} />
                      )}
                      Run setup
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Manual Checklist
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={checklist.isVerified}
                        onChange={(e) =>
                          handleChecklistChange(server, 'isVerified', e.target.checked)
                        }
                        disabled={isBusy}
                      />
                      SSH reachable
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={checklist.hasDocker}
                        onChange={(e) =>
                          handleChecklistChange(server, 'hasDocker', e.target.checked)
                        }
                        disabled={isBusy}
                      />
                      Docker installed
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={checklist.hasAnsible}
                        onChange={(e) =>
                          handleChecklistChange(server, 'hasAnsible', e.target.checked)
                        }
                        disabled={isBusy}
                      />
                      Ansible installed
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={checklist.hasRunner}
                        onChange={(e) =>
                          handleChecklistChange(server, 'hasRunner', e.target.checked)
                        }
                        disabled={isBusy}
                      />
                      GitLab Runner installed
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void handleManualSave(server)}
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
                      onClick={() => void handleMarkReady(server)}
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

                <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                      Job History
                    </p>
                    <button
                      onClick={() => void refreshJobs(server.id)}
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
                    <p className="mt-2 text-xs text-violet-700/80">
                      No jobs yet for this server.
                    </p>
                  )}

                  <div className="mt-2 space-y-2">
                    {jobs.slice(0, 5).map((job) => (
                      <div
                        key={job.id}
                        className="rounded-lg border border-violet-100 bg-white/80 p-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">
                              {formatJobType(job.type)}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {new Date(job.createdAt).toLocaleString()} · attempts{' '}
                              {job.attempts}/{job.maxAttempts}
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
                                onClick={() => void handleRetryJob(server.id, job.id)}
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
                        {job.output && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-600">
                            {job.output}
                          </p>
                        )}
                        {job.error && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-red-600">
                            {job.error}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal d'enregistrement du GitLab Runner */}
      {runnerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              Enregistrer GitLab Runner
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Le runner sera enregistré sur le serveur via SSH.
            </p>
            {runnerError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {runnerError}
              </div>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  URL GitLab <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={runnerGitlabUrl}
                  onChange={(e) => setRunnerGitlabUrl(e.target.value)}
                  placeholder="https://gitlab.example.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Token d&apos;enregistrement <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={runnerToken}
                  onChange={(e) => setRunnerToken(e.target.value)}
                  placeholder="GR1345xyz..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRunnerModal(null);
                  setRunnerError(null);
                }}
                disabled={!!registeringId}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={() => void handleRegisterRunner(runnerModal)}
                disabled={!!registeringId}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {registeringId === runnerModal ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts de notification */}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '@/lib/api';
import { serversService } from '@/services/servers.service';
import type {
  CreateServerPayload,
  Server as ServerType,
  ServerJob,
  UpdateServerPayload,
} from '@/types/server';

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

const ADMIN_SERVERS_QUERY_KEY = ['admin-servers'] as const;

export function useServerActions() {
  const queryClient = useQueryClient();

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installingKeyId, setInstallingKeyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingManualId, setSavingManualId] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [runnerModal, setRunnerModal] = useState<string | null>(null);
  const [runnerGitlabUrl, setRunnerGitlabUrl] = useState('');
  const [runnerToken, setRunnerToken] = useState('');
  const [runnerError, setRunnerError] = useState<string | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const {
    data: servers = [],
    isLoading: loading,
    refetch: refetchServers,
    error: queryError,
  } = useQuery({
    queryKey: ADMIN_SERVERS_QUERY_KEY,
    queryFn: async () => await serversService.getAll(),
  });

  const error = queryError ? getApiErrorMessage(queryError) : null;

  const fetchServers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ADMIN_SERVERS_QUERY_KEY });
    await refetchServers();
  }, [queryClient, refetchServers]);

  // Auto-poll toutes les 3s quand au moins un job RUNNING est actif.
  // Détecte aussi les transitions SUCCESS/FAILED pour afficher un toast de completion.
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevJobStatusRef = useRef<Record<string, ServerJob['status']>>({});

  useEffect(() => {
    const hasRunningJob = Object.values(jobsByServer).some((jobs) =>
      jobs.some((j) => j.status === 'RUNNING'),
    );

    if (hasRunningJob && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        const serverIds = Object.entries(jobsByServer)
          .filter(([, jobs]) => jobs.some((j) => j.status === 'RUNNING'))
          .map(([id]) => id);

        for (const id of serverIds) {
          serversService
            .getJobs(id)
            .then((updatedJobs) => {
              // Détecter les transitions vers SUCCESS ou FAILED
              for (const job of updatedJobs) {
                const prevStatus = prevJobStatusRef.current[job.id];
                if (prevStatus === 'RUNNING') {
                  if (job.status === 'SUCCESS') {
                    showToast(`✓ ${formatJobType(job.type)} terminé avec succès`, 'success');
                  } else if (job.status === 'FAILED' || job.status === 'TIMEOUT') {
                    showToast(`✗ ${formatJobType(job.type)} échoué — voir les logs`, 'error');
                  }
                }
                prevJobStatusRef.current[job.id] = job.status;
              }

              setJobsByServer((prev) => ({ ...prev, [id]: updatedJobs }));
            })
            .catch(() => {});
        }

        void queryClient.invalidateQueries({ queryKey: ADMIN_SERVERS_QUERY_KEY });
      }, 3_000);
    }

    if (!hasRunningJob && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [jobsByServer, queryClient, showToast]);

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

  const getInstallOptions = (server: ServerType): InstallOptions => {
    return (
      installDrafts[server.id] ?? {
        docker: !server.hasDocker,
        ansible: !server.hasAnsible,
        runner: !server.hasRunner,
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

  const handleCreate = async (payload: CreateServerPayload) => {
    setCreating(true);
    try {
      const created = await serversService.create(payload);
      await fetchServers();
      showToast(
        'Server created. Install SSH key with temporary VPS password to continue.',
        'success',
      );
      return created;
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
      throw err;
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string, payload: UpdateServerPayload) => {
    setUpdatingId(id);
    try {
      await serversService.update(id, payload);
      await fetchServers();
      clearManualDraft(id);
      clearInstallDraft(id);
      showToast('Serveur mis à jour', 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
      throw err;
    } finally {
      setUpdatingId(null);
    }
  };

  const handleVerify = async (id: string) => {
    const hasRunning = (jobsByServer[id] ?? []).some((j) => j.status === 'RUNNING');
    if (hasRunning) {
      showToast('Une vérification est déjà en cours sur ce serveur.', 'error');
      return;
    }

    setVerifyingId(id);
    try {
      await serversService.verify(id);
      showToast('Vérification démarrée...', 'success');
      await refreshJobs(id);
      clearManualDraft(id);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setVerifyingId(null);
    }
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
      await serversService.installTools(server.id, payload);
      // Job lancé en arrière-plan — on charge les jobs pour activer le polling
      showToast('Installation démarrée...', 'success');
      await refreshJobs(server.id);
      clearManualDraft(server.id);
      clearInstallDraft(server.id);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setInstallingId(null);
    }
  };

  const handleInstallKey = async (serverId: string, password: string) => {
    setInstallingKeyId(serverId);
    try {
      const result = await serversService.installKey(serverId, {
        password,
      });
      await fetchServers();
      showToast(result.message, 'success');
      return result;
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
      throw err;
    } finally {
      setInstallingKeyId(null);
    }
  };

  const handleManualSave = async (server: ServerType) => {
    const payload = getChecklist(server);
    setSavingManualId(server.id);
    try {
      await serversService.update(server.id, payload);
      await fetchServers();
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
      await serversService.update(server.id, payload);
      await fetchServers();
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
    setDeletingId(id);
    try {
      await serversService.remove(id);
      await fetchServers();
      setJobsByServer((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast(`Serveur "${name}" supprimé`, 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
      throw err;
    } finally {
      setDeletingId(null);
    }
  };

  const handleRetryJob = async (serverId: string, jobId: string) => {
    setRetryingJobId(jobId);
    try {
      await serversService.retryJob(serverId, jobId);
      await fetchServers();
      showToast('Job relancé avec succès', 'success');
      await refreshJobs(serverId);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setRetryingJobId(null);
    }
  };

  const openRunnerModal = (serverId: string) => {
    setRunnerModal(serverId);
    setRunnerGitlabUrl('');
    setRunnerToken('');
    setRunnerError(null);
  };

  const closeRunnerModal = () => {
    setRunnerModal(null);
    setRunnerError(null);
  };

  const handleRegisterRunner = async (serverId: string) => {
    if (!runnerGitlabUrl.trim() || !runnerToken.trim()) {
      setRunnerError("L'URL GitLab et le token sont obligatoires");
      return;
    }

    setRegisteringId(serverId);
    setRunnerError(null);
    try {
      await serversService.registerRunner(serverId, {
        gitlabUrl: runnerGitlabUrl.trim(),
        token: runnerToken.trim(),
      });
      await fetchServers();
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
    return mode.toUpperCase();
  };

  const formatJobType = (type: ServerJob['type']) => {
    if (type === 'INSTALL_TOOLS') {
      return 'Install Tools';
    }
    if (type === 'REGISTER_RUNNER') {
      return 'Register Runner';
    }
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
      return 'border-green-500/20 bg-green-500/10 text-green-400';
    }
    if (status === 'FAILED' || status === 'TIMEOUT' || status === 'BLOCKED') {
      return 'border-red-500/30 bg-red-500/10 text-red-400';
    }
    if (status === 'RUNNING') {
      return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400';
    }
    return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400';
  };

  const verifiedCount = useMemo(
    () => servers.filter((server) => server.isVerified).length,
    [servers],
  );
  const unverifiedCount = servers.length - verifiedCount;

  return {
    servers,
    loading,
    error,
    creating,
    updatingId,
    verifyingId,
    installingId,
    installingKeyId,
    deletingId,
    savingManualId,
    registeringId,
    loadingJobsByServer,
    jobsByServer,
    retryingJobId,
    toasts,
    runnerModal,
    runnerGitlabUrl,
    setRunnerGitlabUrl,
    runnerToken,
    setRunnerToken,
    runnerError,
    fetchServers,
    refreshJobs,
    getChecklist,
    getInstallOptions,
    handleChecklistChange,
    handleInstallOptionChange,
    handleCreate,
    handleUpdate,
    handleVerify,
    handleInstall,
    handleInstallKey,
    handleManualSave,
    handleMarkReady,
    handleDelete,
    handleRetryJob,
    openRunnerModal,
    closeRunnerModal,
    handleRegisterRunner,
    formatConnectionMode,
    formatJobType,
    canRetryJob,
    getJobStatusClassName,
    verifiedCount,
    unverifiedCount,
  };
}

export type UseServerActionsReturn = ReturnType<typeof useServerActions>;

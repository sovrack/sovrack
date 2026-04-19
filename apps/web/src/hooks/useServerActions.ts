'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '@/lib/api';
import { serversService } from '@/services/servers.service';
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

export function useServerActions() {
  const queryClient = useQueryClient();
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
  } = useQuery({
    queryKey: ['admin-servers'],
    queryFn: async () => {
      const nextServers = await serversService.getAll();
      await Promise.all(
        nextServers.map(async (server) => {
          try {
            const jobs = await serversService.getJobs(server.id);
            setJobsByServer((prev) => ({ ...prev, [server.id]: jobs }));
          } catch {
            // Non bloquant.
          }
        }),
      );
      return nextServers;
    },
  });

  const fetchServers = useCallback(async () => {
    setError(null);
    await queryClient.invalidateQueries({ queryKey: ['admin-servers'] });
    await refetchServers();
  }, [queryClient, refetchServers]);

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

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      const result = await serversService.verify(id);
      await queryClient.invalidateQueries({ queryKey: ['admin-servers'] });
      clearManualDraft(id);
      showToast('Vérification SSH réussie', 'success');
      await refreshJobs(id);
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
      const updated = await serversService.installTools(server.id, payload);
      await queryClient.invalidateQueries({ queryKey: ['admin-servers'] });
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
      await serversService.update(server.id, payload);
      await queryClient.invalidateQueries({ queryKey: ['admin-servers'] });
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
      await queryClient.invalidateQueries({ queryKey: ['admin-servers'] });
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
    if (!confirm(`Supprimer le serveur "${name}" ? Cette action est irréversible.`)) {
      return;
    }

    setDeletingId(id);
    try {
      await serversService.remove(id);
      await queryClient.invalidateQueries({ queryKey: ['admin-servers'] });
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
      await serversService.retryJob(serverId, jobId);
      await queryClient.invalidateQueries({ queryKey: ['admin-servers'] });
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
      const updated = await serversService.registerRunner(serverId, {
        gitlabUrl: runnerGitlabUrl.trim(),
        token: runnerToken.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['admin-servers'] });
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
    if (mode === 'bastion') {
      return 'Bastion';
    }
    if (mode === 'agent') {
      return 'Agent';
    }
    return 'SSH';
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

  const verifiedCount = useMemo(
    () => servers.filter((server) => server.isVerified).length,
    [servers],
  );
  const unverifiedCount = servers.length - verifiedCount;

  return {
    servers,
    loading,
    error,
    verifyingId,
    installingId,
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
    handleVerify,
    handleInstall,
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

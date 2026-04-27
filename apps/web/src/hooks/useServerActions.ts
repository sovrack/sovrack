'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '@/lib/api';
import { serversService, type PrepareServerPayload } from '@/services/servers.service';
import type {
  CreateServerPayload,
  Server as ServerType,
  ServerJob,
  UpdateServerPayload,
} from '@/types/server';

type ToastTone = 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };

const ADMIN_SERVERS_QUERY_KEY = ['admin-servers'] as const;

export function useServerActions() {
  const queryClient = useQueryClient();

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [detectingId, setDetectingId] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [installingKeyId, setInstallingKeyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingJobsByServer, setLoadingJobsByServer] = useState<Record<string, boolean>>({});
  const [jobsByServer, setJobsByServer] = useState<Record<string, ServerJob[]>>({});
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [prepareDrafts, setPrepareDrafts] = useState<Record<string, PrepareServerPayload>>({});
  const [toasts, setToasts] = useState<ToastItem[]>([]);

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

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevJobStatusRef = useRef<Record<string, ServerJob['status']>>({});

  useEffect(() => {
    const hasRunningJob = Object.values(jobsByServer).some((jobs) =>
      jobs.some((job) => job.status === 'RUNNING' || job.status === 'PENDING'),
    );

    if (hasRunningJob && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        const serverIds = Object.entries(jobsByServer)
          .filter(([, jobs]) =>
            jobs.some((job) => job.status === 'RUNNING' || job.status === 'PENDING'),
          )
          .map(([id]) => id);

        for (const id of serverIds) {
          serversService
            .getJobs(id)
            .then((updatedJobs) => {
              for (const job of updatedJobs) {
                const prevStatus = prevJobStatusRef.current[job.id];
                if (prevStatus === 'RUNNING' || prevStatus === 'PENDING') {
                  if (job.status === 'SUCCESS') {
                    showToast(`${formatJobType(job.type)} completed`, 'success');
                  } else if (job.status === 'FAILED' || job.status === 'TIMEOUT') {
                    showToast(`${formatJobType(job.type)} failed`, 'error');
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

  const getPrepareOptions = (server: ServerType): PrepareServerPayload => {
    return (
      prepareDrafts[server.id] ?? {
        profile: 'BASIC',
        gitlabRunnerExecutor: 'docker',
      }
    );
  };

  const handlePrepareOptionChange = (
    server: ServerType,
    field: keyof PrepareServerPayload,
    value: boolean | string,
  ) => {
    const current = getPrepareOptions(server);
    setPrepareDrafts((prev) => ({
      ...prev,
      [server.id]: {
        ...current,
        [field]: value,
      },
    }));
  };

  const clearPrepareDraft = (serverId: string) => {
    setPrepareDrafts((prev) => {
      const next = { ...prev };
      delete next[serverId];
      return next;
    });
  };

  const handleCreate = async (payload: CreateServerPayload) => {
    setCreating(true);
    try {
      const created = await serversService.create(payload);
      await fetchServers();
      showToast('Server created. Install SSH key to continue.', 'success');
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
      showToast('Server updated', 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
      throw err;
    } finally {
      setUpdatingId(null);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await serversService.verify(id);
      showToast('SSH validation started', 'success');
      await refreshJobs(id);
      await fetchServers();
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDetect = async (id: string) => {
    setDetectingId(id);
    try {
      await serversService.detect(id);
      showToast('Server information detected', 'success');
      await fetchServers();
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setDetectingId(null);
    }
  };

  const handlePrepare = async (server: ServerType) => {
    const payload = getPrepareOptions(server);
    setPreparingId(server.id);
    try {
      await serversService.prepare(server.id, payload);
      showToast('Preparation started', 'success');
      await refreshJobs(server.id);
      await fetchServers();
      clearPrepareDraft(server.id);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setPreparingId(null);
    }
  };

  const handleInstallKey = async (serverId: string, password: string) => {
    setInstallingKeyId(serverId);
    try {
      const result = await serversService.installKey(serverId, { password });
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
      showToast(`Server "${name}" deleted`, 'success');
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
      showToast('Job retried', 'success');
      await refreshJobs(serverId);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setRetryingJobId(null);
    }
  };

  const formatConnectionMode = (mode: ServerType['connectionMode']) => mode.toUpperCase();

  const canRetryJob = (job: ServerJob) => {
    const retryableStatuses: ServerJob['status'][] = ['FAILED', 'TIMEOUT', 'BLOCKED'];
    return retryableStatuses.includes(job.status) && job.type !== 'REGISTER_RUNNER';
  };

  const getJobStatusClassName = (status: ServerJob['status']) => {
    if (status === 'SUCCESS') {
      return 'border-green-500/20 bg-green-500/10 text-green-400';
    }
    if (status === 'FAILED' || status === 'TIMEOUT' || status === 'BLOCKED') {
      return 'border-red-500/30 bg-red-500/10 text-red-400';
    }
    if (status === 'RUNNING' || status === 'PENDING') {
      return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
    }
    return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400';
  };

  const verifiedCount = useMemo(
    () => servers.filter((server) => server.isVerified).length,
    [servers],
  );
  const readyCount = useMemo(
    () => servers.filter((server) => server.status === 'PREPARED').length,
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
    detectingId,
    preparingId,
    installingKeyId,
    deletingId,
    loadingJobsByServer,
    jobsByServer,
    retryingJobId,
    toasts,
    fetchServers,
    refreshJobs,
    getPrepareOptions,
    handlePrepareOptionChange,
    handleCreate,
    handleUpdate,
    handleVerify,
    handleDetect,
    handlePrepare,
    handleInstallKey,
    handleDelete,
    handleRetryJob,
    formatConnectionMode,
    formatJobType,
    canRetryJob,
    getJobStatusClassName,
    verifiedCount,
    readyCount,
    unverifiedCount,
  };
}

export function formatJobType(type: ServerJob['type']) {
  if (type === 'INSTALL_TOOLS') {
    return 'Legacy setup';
  }
  if (type === 'PREPARE_SERVER') {
    return 'Prepare Server';
  }
  if (type === 'REGISTER_RUNNER') {
    return 'Register Runner';
  }
  return 'Validate SSH';
}

export type UseServerActionsReturn = ReturnType<typeof useServerActions>;

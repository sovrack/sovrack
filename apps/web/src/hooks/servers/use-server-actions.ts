'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '@/lib/api';
import { serversService, type PrepareServerPayload } from '@/services/servers.service';
import {
  canCancelJob,
  canRetryJob,
  formatConnectionMode,
  formatJobType,
  getJobStatusClassName,
} from '@/lib/server-utils';
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
  const [cancelingJobId, setCancelingJobId] = useState<string | null>(null);
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
    staleTime: 10_000,
  });

  const error = queryError ? getApiErrorMessage(queryError) : null;

  const fetchServers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ADMIN_SERVERS_QUERY_KEY });
    await refetchServers();
  }, [queryClient, refetchServers]);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks the active job (id + type) seen per server on the previous render so
  // we can fire a completion toast when it clears, with a single targeted fetch.
  const prevActiveJobRef = useRef<
    Record<string, { jobId: string; type: ServerJob['type'] }>
  >({});

  useEffect(() => {
    const serversWithActiveJob = servers.filter((s) => s.activeJob);
    const activeServerIds = new Set(serversWithActiveJob.map((s) => s.id));

    // Detect transitions: a server that HAD an active job but no longer does.
    // Fetch that server's jobs once to report the final status accurately.
    for (const [serverId, prev] of Object.entries(prevActiveJobRef.current)) {
      if (!activeServerIds.has(serverId)) {
        delete prevActiveJobRef.current[serverId];
        serversService
          .getJobs(serverId)
          .then((jobs) => {
            const finished = jobs.find((j) => j.id === prev.jobId);
            if (finished?.status === 'SUCCESS') {
              showToast(`${formatJobType(prev.type)} completed`, 'success');
            } else if (
              finished?.status === 'FAILED' ||
              finished?.status === 'TIMEOUT'
            ) {
              showToast(`${formatJobType(prev.type)} failed`, 'error');
            }
            setJobsByServer((cur) => ({ ...cur, [serverId]: jobs }));
          })
          .catch(() => {});
      }
    }

    // Record current active jobs for next comparison
    for (const s of serversWithActiveJob) {
      if (s.activeJob) {
        prevActiveJobRef.current[s.id] = {
          jobId: s.activeJob.id,
          type: s.activeJob.type,
        };
      }
    }

    const hasActiveJob = serversWithActiveJob.length > 0;

    // While any server is locked, poll the servers list (single request that
    // already carries activeJob) instead of polling jobs per server.
    if (hasActiveJob && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        void queryClient.invalidateQueries({ queryKey: ADMIN_SERVERS_QUERY_KEY });
        // Keep the open details dialog's full job history fresh, if loaded.
        for (const id of activeServerIds) {
          if (jobsByServer[id]) {
            serversService
              .getJobs(id)
              .then((jobs) => setJobsByServer((prev) => ({ ...prev, [id]: jobs })))
              .catch(() => {});
          }
        }
      }, 3_000);
    }

    if (!hasActiveJob && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [servers, jobsByServer, queryClient, showToast]);

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
        gitlabRunnerExecutor: 'docker',
      }
    );
  };

  const handlePrepareOptionChange = (
    server: ServerType,
    field: keyof PrepareServerPayload,
    value: boolean | string | string[],
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

  const handleCancelJob = async (serverId: string, jobId: string) => {
    setCancelingJobId(jobId);
    try {
      await serversService.cancelJob(serverId, jobId);
      showToast('Job canceled — the server is available again', 'success');
      await refreshJobs(serverId);
      await fetchServers();
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setCancelingJobId(null);
    }
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
    cancelingJobId,
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
    handleCancelJob,
    formatConnectionMode,
    formatJobType,
    canRetryJob,
    canCancelJob,
    getJobStatusClassName,
    verifiedCount,
    readyCount,
    unverifiedCount,
  };
}

export type UseServerActionsReturn = ReturnType<typeof useServerActions>;

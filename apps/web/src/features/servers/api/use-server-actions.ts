"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/contexts/toast-context";
import { getApiErrorMessage } from "@/shared/lib/api";
import {
  serversService,
  type PrepareServerPayload,
} from "@/features/servers/api/servers.service";
import {
  canCancelJob,
  canRetryJob,
  formatConnectionMode,
  formatJobType,
  getJobStatusClassName,
} from "@/features/servers/utils";
import { serverKeys } from "@/features/servers/api/server-query-keys";
import type {
  CreateServerPayload,
  Server as ServerType,
  ServerJob,
  UpdateServerPayload,
} from "@/features/servers/types/server";

export function useServerActions() {
  const queryClient = useQueryClient();

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [detectingId, setDetectingId] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [installingKeyId, setInstallingKeyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingJobsByServer, setLoadingJobsByServer] = useState<
    Record<string, boolean>
  >({});
  const [jobsByServer, setJobsByServer] = useState<Record<string, ServerJob[]>>(
    {},
  );
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [cancelingJobId, setCancelingJobId] = useState<string | null>(null);
  const [prepareDrafts, setPrepareDrafts] = useState<
    Record<string, PrepareServerPayload>
  >({});
  const showToast = useToast();

  /**
   * Tracks the active job seen per server on the previous successful fetch so
   * we can detect job-completion transitions and fire a toast.
   */
  const prevActiveJobRef = useRef<
    Record<string, { jobId: string; type: ServerJob["type"] }>
  >({});

  const {
    data: servers = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: serverKeys.adminList(),
    queryFn: async () => {
      const result = await serversService.getAll();

      // Detect job-completion transitions: a server that HAD an active job
      // but no longer does → fetch its jobs once for the final status toast.
      const activeNow = new Set(
        result.filter((s) => s.activeJob).map((s) => s.id),
      );
      for (const [serverId, prev] of Object.entries(prevActiveJobRef.current)) {
        if (!activeNow.has(serverId)) {
          delete prevActiveJobRef.current[serverId];
          serversService
            .getJobs(serverId)
            .then((jobs) => {
              const finished = jobs.find((j) => j.id === prev.jobId);
              if (finished?.status === "SUCCESS") {
                showToast(`${formatJobType(prev.type)} completed`, "success");
              } else if (
                finished?.status === "FAILED" ||
                finished?.status === "TIMEOUT"
              ) {
                showToast(`${formatJobType(prev.type)} failed`, "error");
              }
              setJobsByServer((cur) => ({ ...cur, [serverId]: jobs }));
            })
            .catch(() => {});
        }
      }
      for (const s of result) {
        if (s.activeJob) {
          prevActiveJobRef.current[s.id] = {
            jobId: s.activeJob.id,
            type: s.activeJob.type,
          };
        }
      }

      return result;
    },
    staleTime: 10_000,
    // Poll every 3 s while any server has an active job; stop when idle.
    // React Query handles the interval internally — no manual setInterval needed.
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      return data.some((s) => s.activeJob) ? 3_000 : false;
    },
  });

  const error = queryError ? getApiErrorMessage(queryError) : null;

  const fetchServers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: serverKeys.adminList() });
  }, [queryClient]);

  const refreshJobs = async (serverId: string) => {
    setLoadingJobsByServer((prev) => ({ ...prev, [serverId]: true }));
    try {
      const jobs = await serversService.getJobs(serverId);
      setJobsByServer((prev) => ({ ...prev, [serverId]: jobs }));
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setLoadingJobsByServer((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  const getPrepareOptions = (server: ServerType): PrepareServerPayload => {
    return (
      prepareDrafts[server.id] ?? {
        gitlabRunnerExecutor: "docker",
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
      showToast("Server created. Install SSH key to continue.", "success");
      return created;
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
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
      showToast("Server updated", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
      throw err;
    } finally {
      setUpdatingId(null);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await serversService.verify(id);
      showToast("SSH validation started", "success");
      await refreshJobs(id);
      await fetchServers();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDetect = async (id: string) => {
    setDetectingId(id);
    try {
      await serversService.detect(id);
      showToast("Server information detected", "success");
      await fetchServers();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setDetectingId(null);
    }
  };

  const handlePrepare = async (server: ServerType) => {
    const payload = getPrepareOptions(server);
    setPreparingId(server.id);
    try {
      await serversService.prepare(server.id, payload);
      showToast("Preparation started", "success");
      await refreshJobs(server.id);
      await fetchServers();
      clearPrepareDraft(server.id);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setPreparingId(null);
    }
  };

  const handleInstallKey = async (serverId: string, password: string) => {
    setInstallingKeyId(serverId);
    try {
      const result = await serversService.installKey(serverId, { password });
      await fetchServers();
      showToast(result.message, "success");
      return result;
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
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
      showToast(`Server "${name}" deleted`, "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
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
      showToast("Job retried", "success");
      await refreshJobs(serverId);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setRetryingJobId(null);
    }
  };

  const handleCancelJob = async (serverId: string, jobId: string) => {
    setCancelingJobId(jobId);
    try {
      await serversService.cancelJob(serverId, jobId);
      showToast("Job canceled — the server is available again", "success");
      await refreshJobs(serverId);
      await fetchServers();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setCancelingJobId(null);
    }
  };

  const verifiedCount = useMemo(
    () => servers.filter((server) => server.isVerified).length,
    [servers],
  );
  const readyCount = useMemo(
    () => servers.filter((server) => server.status === "PREPARED").length,
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

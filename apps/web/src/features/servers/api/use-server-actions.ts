"use client";

import { useCallback, useMemo, useReducer, useRef } from "react";
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

/* ─── State + reducer ──────────────────────────────────────────────────────
 * The 12 pieces of local state (verifyingId, detectingId, preparingId,
 * installingKeyId, deletingId, updatingId, creating, loadingJobsByServer,
 * jobsByServer, retryingJobId, cancelingJobId, prepareDrafts) were
 * previously 12 independent useState calls. Consolidated into one
 * ServerActionsState + a reducer. The single-id fields (verifyingId etc.)
 * deliberately stay individual nullable-id fields rather than a shared
 * Record<id, action> map: they already behave as "one global slot per
 * action type" in the original code (a second concurrent call on a
 * different id silently overwrites the first), and merging them into a
 * shared map would change that observable behavior. The hook's returned
 * API is unchanged so all consumers (admin/servers/page.tsx and children)
 * need no changes. */

type ServerActionsState = {
  verifyingId: string | null;
  detectingId: string | null;
  preparingId: string | null;
  installingKeyId: string | null;
  deletingId: string | null;
  updatingId: string | null;
  creating: boolean;
  loadingJobsByServer: Record<string, boolean>;
  jobsByServer: Record<string, ServerJob[]>;
  retryingJobId: string | null;
  cancelingJobId: string | null;
  prepareDrafts: Record<string, PrepareServerPayload>;
};

const initialState: ServerActionsState = {
  verifyingId: null,
  detectingId: null,
  preparingId: null,
  installingKeyId: null,
  deletingId: null,
  updatingId: null,
  creating: false,
  loadingJobsByServer: {},
  jobsByServer: {},
  retryingJobId: null,
  cancelingJobId: null,
  prepareDrafts: {},
};

type SetFieldAction = {
  [K in keyof ServerActionsState]: {
    type: "SET_FIELD";
    field: K;
    value: ServerActionsState[K];
  };
}[keyof ServerActionsState];

type ServerActionsReducerAction =
  | SetFieldAction
  | { type: "SET_LOADING_JOBS_FOR_SERVER"; serverId: string; loading: boolean }
  | { type: "SET_JOBS_FOR_SERVER"; serverId: string; jobs: ServerJob[] }
  | { type: "REMOVE_JOBS_FOR_SERVER"; serverId: string }
  | { type: "SET_PREPARE_DRAFT"; serverId: string; draft: PrepareServerPayload }
  | { type: "CLEAR_PREPARE_DRAFT"; serverId: string };

function serverActionsReducer(
  state: ServerActionsState,
  action: ServerActionsReducerAction,
): ServerActionsState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_LOADING_JOBS_FOR_SERVER":
      return {
        ...state,
        loadingJobsByServer: {
          ...state.loadingJobsByServer,
          [action.serverId]: action.loading,
        },
      };
    case "SET_JOBS_FOR_SERVER":
      return {
        ...state,
        jobsByServer: { ...state.jobsByServer, [action.serverId]: action.jobs },
      };
    case "REMOVE_JOBS_FOR_SERVER": {
      const next = { ...state.jobsByServer };
      delete next[action.serverId];
      return { ...state, jobsByServer: next };
    }
    case "SET_PREPARE_DRAFT":
      return {
        ...state,
        prepareDrafts: { ...state.prepareDrafts, [action.serverId]: action.draft },
      };
    case "CLEAR_PREPARE_DRAFT": {
      const next = { ...state.prepareDrafts };
      delete next[action.serverId];
      return { ...state, prepareDrafts: next };
    }
    default:
      return state;
  }
}

export function useServerActions() {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(serverActionsReducer, initialState);
  const {
    verifyingId,
    detectingId,
    preparingId,
    installingKeyId,
    deletingId,
    updatingId,
    creating,
    loadingJobsByServer,
    jobsByServer,
    retryingJobId,
    cancelingJobId,
    prepareDrafts,
  } = state;

  const setField = useCallback(
    <K extends keyof ServerActionsState>(field: K, value: ServerActionsState[K]) => {
      dispatch({ type: "SET_FIELD", field, value } as SetFieldAction);
    },
    [],
  );

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
              dispatch({ type: "SET_JOBS_FOR_SERVER", serverId, jobs });
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
    dispatch({ type: "SET_LOADING_JOBS_FOR_SERVER", serverId, loading: true });
    try {
      const jobs = await serversService.getJobs(serverId);
      dispatch({ type: "SET_JOBS_FOR_SERVER", serverId, jobs });
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      dispatch({ type: "SET_LOADING_JOBS_FOR_SERVER", serverId, loading: false });
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
    dispatch({
      type: "SET_PREPARE_DRAFT",
      serverId: server.id,
      draft: { ...current, [field]: value },
    });
  };

  const clearPrepareDraft = (serverId: string) => {
    dispatch({ type: "CLEAR_PREPARE_DRAFT", serverId });
  };

  const handleCreate = async (payload: CreateServerPayload) => {
    setField("creating", true);
    try {
      const created = await serversService.create(payload);
      await fetchServers();
      showToast("Server created. Install SSH key to continue.", "success");
      return created;
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
      throw err;
    } finally {
      setField("creating", false);
    }
  };

  const handleUpdate = async (id: string, payload: UpdateServerPayload) => {
    setField("updatingId", id);
    try {
      await serversService.update(id, payload);
      await fetchServers();
      showToast("Server updated", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
      throw err;
    } finally {
      setField("updatingId", null);
    }
  };

  const handleVerify = async (id: string) => {
    setField("verifyingId", id);
    try {
      await serversService.verify(id);
      showToast("SSH validation started", "success");
      await refreshJobs(id);
      await fetchServers();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setField("verifyingId", null);
    }
  };

  const handleDetect = async (id: string) => {
    setField("detectingId", id);
    try {
      await serversService.detect(id);
      showToast("Server information detected", "success");
      await fetchServers();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setField("detectingId", null);
    }
  };

  const handlePrepare = async (server: ServerType) => {
    const payload = getPrepareOptions(server);
    setField("preparingId", server.id);
    try {
      await serversService.prepare(server.id, payload);
      showToast("Setup started", "success");
      await refreshJobs(server.id);
      await fetchServers();
      clearPrepareDraft(server.id);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setField("preparingId", null);
    }
  };

  const handleInstallKey = async (serverId: string, password: string) => {
    setField("installingKeyId", serverId);
    try {
      const result = await serversService.installKey(serverId, { password });
      await fetchServers();
      showToast(result.message, "success");
      return result;
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
      throw err;
    } finally {
      setField("installingKeyId", null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setField("deletingId", id);
    try {
      await serversService.remove(id);
      await fetchServers();
      dispatch({ type: "REMOVE_JOBS_FOR_SERVER", serverId: id });
      showToast(`Server "${name}" deleted`, "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
      throw err;
    } finally {
      setField("deletingId", null);
    }
  };

  const handleRetryJob = async (serverId: string, jobId: string) => {
    setField("retryingJobId", jobId);
    try {
      await serversService.retryJob(serverId, jobId);
      await fetchServers();
      showToast("Job retried", "success");
      await refreshJobs(serverId);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setField("retryingJobId", null);
    }
  };

  const handleCancelJob = async (serverId: string, jobId: string) => {
    setField("cancelingJobId", jobId);
    try {
      await serversService.cancelJob(serverId, jobId);
      showToast("Job canceled — the server is available again", "success");
      await refreshJobs(serverId);
      await fetchServers();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setField("cancelingJobId", null);
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

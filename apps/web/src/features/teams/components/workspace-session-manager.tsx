"use client";

import { useEffect } from "react";
import api, { getApiErrorMessage } from "@/shared/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { useWorkspaceStore } from "@/stores/workspace.store";
import type { WorkspaceSummary } from "@/features/teams/types/team";

export function WorkspaceSessionManager({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authInitialized = useAuthStore((state) => state.initialized);
  const beginLoading = useWorkspaceStore((state) => state.beginLoading);
  const setWorkspaces = useWorkspaceStore((state) => state.setWorkspaces);
  const setError = useWorkspaceStore((state) => state.setError);
  const clear = useWorkspaceStore((state) => state.clear);

  useEffect(() => {
    if (!authInitialized) return;
    if (!isAuthenticated) {
      clear();
      return;
    }

    let cancelled = false;
    beginLoading();
    void api
      .get<WorkspaceSummary[]>("/workspaces")
      .then((response) => {
        if (!cancelled) setWorkspaces(response.data);
      })
      .catch((error: unknown) => {
        if (!cancelled) setError(getApiErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [
    authInitialized,
    beginLoading,
    clear,
    isAuthenticated,
    setError,
    setWorkspaces,
  ]);

  return <>{children}</>;
}

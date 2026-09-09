"use client";

import { useAuthStore } from "@/stores/auth.store";
import { useWorkspaceStore } from "@/stores/workspace.store";

export const useAuth = () => {
  const auth = useAuthStore();
  const workspace = useWorkspaceStore();
  const workspaceRole =
    workspace.workspaces.find(
      (item) => item.id === workspace.selectedWorkspaceId,
    )?.role ?? null;

  return {
    ...auth,
    loading:
      auth.loading ||
      (auth.isAuthenticated && (!workspace.initialized || workspace.loading)),
    isAdmin: workspaceRole === "OWNER" || workspaceRole === "ADMIN",
    workspaceRole,
    selectedWorkspaceId: workspace.selectedWorkspaceId,
  };
};

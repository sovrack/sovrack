"use client";

import { useAuthStore } from "@/stores/auth.store";
import { useWorkspaceStore } from "@/stores/workspace.store";

export const useAuth = () => {
  const auth = useAuthStore();
  const workspace = useWorkspaceStore();
  const membership = workspace.workspaces
    .find((item) => item.id === workspace.selectedWorkspaceId)
    ?.members.find((member) => member.userId === auth.user?.id);
  const workspaceRole = membership?.role ?? null;

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

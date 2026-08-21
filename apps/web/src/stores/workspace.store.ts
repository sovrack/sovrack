import { create } from "zustand";
import type { Team } from "@/features/teams/types/team";
import {
  readWorkspaceSelection,
  writeWorkspaceSelection,
} from "@/shared/lib/workspace-storage";

type WorkspaceState = {
  workspaces: Team[];
  selectedWorkspaceId: string | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  beginLoading: () => void;
  setWorkspaces: (workspaces: Team[]) => void;
  setError: (message: string) => void;
  selectWorkspace: (workspaceId: string) => void;
  clear: () => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  selectedWorkspaceId: null,
  loading: false,
  initialized: false,
  error: null,
  beginLoading: () => set({ loading: true, error: null }),
  setWorkspaces: (workspaces) => {
    const current = get().selectedWorkspaceId ?? readWorkspaceSelection();
    const selectedWorkspaceId = workspaces.some(
      (workspace) => workspace.id === current,
    )
      ? current
      : (workspaces[0]?.id ?? null);
    writeWorkspaceSelection(selectedWorkspaceId);
    set({
      workspaces,
      selectedWorkspaceId,
      loading: false,
      initialized: true,
      error: null,
    });
  },
  setError: (error) =>
    set(() => {
      writeWorkspaceSelection(null);
      return {
        loading: false,
        initialized: true,
        error,
        workspaces: [],
        selectedWorkspaceId: null,
      };
    }),
  selectWorkspace: (workspaceId) => {
    if (!get().workspaces.some((workspace) => workspace.id === workspaceId)) {
      return;
    }
    writeWorkspaceSelection(workspaceId);
    set({ selectedWorkspaceId: workspaceId });
  },
  clear: () => {
    writeWorkspaceSelection(null);
    set({
      workspaces: [],
      selectedWorkspaceId: null,
      loading: false,
      initialized: false,
      error: null,
    });
  },
}));

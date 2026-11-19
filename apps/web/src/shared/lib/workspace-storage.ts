const WORKSPACE_SELECTION_KEY = "sovrack-selected-workspace";

export function readWorkspaceSelection(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(WORKSPACE_SELECTION_KEY)?.trim();
  return value || null;
}

export function writeWorkspaceSelection(workspaceId: string | null): void {
  if (typeof window === "undefined") return;
  if (workspaceId) {
    window.localStorage.setItem(WORKSPACE_SELECTION_KEY, workspaceId);
  } else {
    window.localStorage.removeItem(WORKSPACE_SELECTION_KEY);
  }
}

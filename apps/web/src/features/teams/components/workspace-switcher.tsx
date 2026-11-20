"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace.store";

export function WorkspaceSwitcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const selectedWorkspaceId = useWorkspaceStore(
    (state) => state.selectedWorkspaceId,
  );
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);

  if (workspaces.length === 0) return null;

  return (
    <label className="relative flex w-28 min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-border bg-card px-2.5 py-1.5 sm:w-auto sm:max-w-52">
      <Building2 size={15} className="shrink-0 text-muted" />
      <select
        aria-label="Workspace actif"
        value={selectedWorkspaceId ?? ""}
        onChange={(event) => {
          selectWorkspace(event.target.value);
          queryClient.clear();
          router.push("/dashboard");
          router.refresh();
        }}
        className="w-full min-w-0 appearance-none bg-transparent pr-5 text-sm font-semibold text-primary outline-none sm:max-w-44"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2 text-muted"
      />
    </label>
  );
}

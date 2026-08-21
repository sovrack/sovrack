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
    <label className="relative flex min-w-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5">
      <Building2 size={15} className="shrink-0 text-[var(--text-muted)]" />
      <select
        aria-label="Workspace actif"
        value={selectedWorkspaceId ?? ""}
        onChange={(event) => {
          selectWorkspace(event.target.value);
          queryClient.clear();
          router.push("/dashboard");
          router.refresh();
        }}
        className="min-w-0 max-w-44 appearance-none bg-transparent pr-5 text-sm font-semibold text-[var(--text-primary)] outline-none"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2 text-[var(--text-muted)]"
      />
    </label>
  );
}

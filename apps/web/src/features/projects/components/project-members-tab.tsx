import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { AddMemberModal } from "@/features/projects/components/add-member-modal";
import { MembersList } from "@/features/projects/components/members-list";
import type { ProjectDetail } from "@/features/projects/types/project";

type ProjectMembersTabProps = {
  project: ProjectDetail;
  isOwner: boolean;
  currentUserId?: string;
  addMemberOpen: boolean;
  setAddMemberOpen: (open: boolean) => void;
  onAddMember: (
    email: string,
    role: "MAINTAINER" | "DEVELOPER" | "VIEWER",
  ) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onRoleChange: (
    userId: string,
    role: "MAINTAINER" | "DEVELOPER" | "VIEWER",
  ) => Promise<void>;
  onDeleteProject?: () => void;
  deleteLoading?: boolean;
};

export function ProjectMembersTab({
  project,
  isOwner,
  currentUserId,
  addMemberOpen,
  setAddMemberOpen,
  onAddMember,
  onRemoveMember,
  onRoleChange,
  onDeleteProject,
  deleteLoading = false,
}: ProjectMembersTabProps) {
  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setAddMemberOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:opacity-90"
          >
            <Plus size={15} />
            Add Member
          </button>
        </div>
      )}

      <MembersList
        members={project.members}
        canManage={isOwner}
        currentUserId={currentUserId}
        onRemove={onRemoveMember}
        onRoleChange={onRoleChange}
      />

      <AddMemberModal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        onAdd={onAddMember}
      />

      {isOwner && onDeleteProject && (
        <div className="overflow-hidden rounded-2xl border border-red-500/20 bg-[var(--bg-card)]">
          <div className="flex items-center gap-3 border-b border-red-500/20 px-5 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <AlertTriangle size={15} className="text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-300">Danger Zone</p>
              <p className="text-xs text-[var(--text-muted)]">
                Irreversible actions — proceed with caution
              </p>
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Delete this project
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Removes all environments, deployments, configs and files
                  permanently. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={onDeleteProject}
                disabled={deleteLoading}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                {deleteLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import { AddMemberModal } from '@/components/projects/add-member-modal';
import { MembersList } from '@/components/projects/members-list';
import type { ProjectDetail } from '@/types/project';
import type { Team } from '@/types/team';

type ProjectMembersTabProps = {
  project: ProjectDetail;
  isOwner: boolean;
  isAdmin: boolean;
  currentUserId?: string;
  addMemberOpen: boolean;
  setAddMemberOpen: (open: boolean) => void;
  teams: Team[];
  selectedTeamId: string;
  setSelectedTeamId: (value: string) => void;
  addTeamLoading: boolean;
  addTeamSuccess: string | null;
  addTeamError: string | null;
  onAddMember: (email: string, role: 'OWNER' | 'DEVELOPER' | 'VIEWER') => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onAddTeam: () => Promise<void>;
  onDeleteProject?: () => void;
  deleteLoading?: boolean;
};

export function ProjectMembersTab({
  project,
  isOwner,
  isAdmin,
  currentUserId,
  addMemberOpen,
  setAddMemberOpen,
  teams,
  selectedTeamId,
  setSelectedTeamId,
  addTeamLoading,
  addTeamSuccess,
  addTeamError,
  onAddMember,
  onRemoveMember,
  onAddTeam,
  onDeleteProject,
  deleteLoading = false,
}: ProjectMembersTabProps) {
  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex justify-end">
          <button
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
              <p className="text-xs text-[var(--text-muted)]">Irreversible actions — proceed with caution</p>
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Delete this project</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Removes all environments, deployments, configs and files permanently. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={onDeleteProject}
                disabled={deleteLoading}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                {deleteLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && teams.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Add a team</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Ajoute tous les membres d&apos;une team au projet.
          </p>

          {addTeamSuccess && (
            <div className="mt-3 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
              {addTeamSuccess}
            </div>
          )}
          {addTeamError && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {addTeamError}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <select
              value={selectedTeamId}
              onChange={(event) => setSelectedTeamId(event.target.value)}
              className="h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:bg-[var(--bg-card)]/10 focus:ring-2 focus:ring-zinc-500/20"
            >
              <option value="">Select a team...</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.members.length} membre{team.members.length !== 1 ? 's' : ''})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void onAddTeam()}
              disabled={!selectedTeamId || addTeamLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50"
            >
              {addTeamLoading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Plus size={15} />
              )}
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

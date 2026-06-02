import { Loader2, Plus } from 'lucide-react';
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

      {isAdmin && teams.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ajouter une équipe</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Ajoute tous les membres d&apos;une équipe au projet.
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
              <option value="">Sélectionner une équipe...</option>
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
              Ajouter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

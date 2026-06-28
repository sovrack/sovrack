'use client';

import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/shared/lib/api';
import { projectsService } from '@/features/projects/api/projects.service';
import { teamsService } from '@/features/teams';
import type { ProjectRole } from '@/features/projects/types/project';
import type { Team } from '@/features/teams';

type UseProjectMembersParams = {
  projectId: string;
  isAdmin: boolean;
  refreshProject: () => Promise<void>;
};

export function useProjectMembers({
  projectId,
  isAdmin,
  refreshProject,
}: UseProjectMembersParams) {
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [addTeamLoading, setAddTeamLoading] = useState(false);
  const [addTeamSuccess, setAddTeamSuccess] = useState<string | null>(null);
  const [addTeamError, setAddTeamError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setTeams([]);
      return;
    }

    teamsService.getAll().then(setTeams).catch(() => {
      setTeams([]);
    });
  }, [isAdmin]);

  const handleAddMember = async (email: string, role: ProjectRole) => {
    await projectsService.addMember(projectId, { email, role });
    await refreshProject();
  };

  const handleRemoveMember = async (userId: string) => {
    await projectsService.removeMember(projectId, userId);
    await refreshProject();
  };

  const handleAddTeam = async () => {
    if (!selectedTeamId) {
      return;
    }

    setAddTeamLoading(true);
    setAddTeamError(null);
    setAddTeamSuccess(null);

    try {
      const result = await teamsService.addTeamToProject(projectId, selectedTeamId);
      setAddTeamSuccess(result.message);
      setSelectedTeamId('');
      await refreshProject();
    } catch (error) {
      setAddTeamError(getApiErrorMessage(error));
    } finally {
      setAddTeamLoading(false);
    }
  };

  return {
    addMemberOpen,
    setAddMemberOpen,
    teams,
    selectedTeamId,
    setSelectedTeamId,
    addTeamLoading,
    addTeamSuccess,
    addTeamError,
    handleAddMember,
    handleRemoveMember,
    handleAddTeam,
  };
}

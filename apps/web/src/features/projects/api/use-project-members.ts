"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiErrorMessage } from "@/shared/lib/api";
import { projectsService } from "@/features/projects/api/projects.service";
import { projectKeys } from "@/features/projects/api/project-query-keys";
import { useTeams } from "@/features/teams";
import { teamsService } from "@/features/teams";
import type { ProjectRole } from "@/features/projects/types/project";

type UseProjectMembersParams = {
  projectId: string;
  isAdmin: boolean;
};

export function useProjectMembers({
  projectId,
  isAdmin,
}: UseProjectMembersParams) {
  const queryClient = useQueryClient();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [addTeamLoading, setAddTeamLoading] = useState(false);
  const [addTeamSuccess, setAddTeamSuccess] = useState<string | null>(null);
  const [addTeamError, setAddTeamError] = useState<string | null>(null);

  const { teams } = useTeams();
  const visibleTeams = isAdmin ? teams : [];

  const invalidateProject = () =>
    queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });

  const handleAddMember = async (email: string, role: ProjectRole) => {
    await projectsService.addMember(projectId, { email, role });
    await invalidateProject();
  };

  const handleRemoveMember = async (userId: string) => {
    await projectsService.removeMember(projectId, userId);
    await invalidateProject();
  };

  const handleAddTeam = async () => {
    if (!selectedTeamId) return;

    setAddTeamLoading(true);
    setAddTeamError(null);
    setAddTeamSuccess(null);

    try {
      const result = await teamsService.addTeamToProject(
        projectId,
        selectedTeamId,
      );
      setAddTeamSuccess(result.message);
      setSelectedTeamId("");
      await invalidateProject();
    } catch (error) {
      setAddTeamError(getApiErrorMessage(error));
    } finally {
      setAddTeamLoading(false);
    }
  };

  return {
    addMemberOpen,
    setAddMemberOpen,
    teams: visibleTeams,
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

"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { projectsService } from "@/features/projects/api/projects.service";
import { projectKeys } from "@/features/projects/api/project-query-keys";
import type { ProjectRole } from "@/features/projects/types/project";

type UseProjectMembersParams = {
  projectId: string;
};

export function useProjectMembers({ projectId }: UseProjectMembersParams) {
  const queryClient = useQueryClient();
  const [addMemberOpen, setAddMemberOpen] = useState(false);

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

  const handleRoleChange = async (userId: string, role: ProjectRole) => {
    await projectsService.updateMemberRole(projectId, userId, role);
    await invalidateProject();
  };

  return {
    addMemberOpen,
    setAddMemberOpen,
    handleAddMember,
    handleRemoveMember,
    handleRoleChange,
  };
}

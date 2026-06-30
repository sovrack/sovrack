"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deploymentsService } from "@/features/deployments";
import type { Deployment } from "@/features/deployments/types";
import { projectKeys } from "@/features/projects/api/project-query-keys";

function hasActiveDeployment(deployments: Deployment[]): boolean {
  return deployments.some(
    (d) => d.status === "PENDING" || d.status === "RUNNING",
  );
}

export function useProjectDeployments(projectId: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: projectKeys.deployments(projectId),
    queryFn: () => deploymentsService.getByProject(projectId),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    // Poll every 5s when there's an active deployment, otherwise 30s
    refetchInterval: (query) => {
      const deployments = query.state.data ?? [];
      return hasActiveDeployment(deployments) ? 5_000 : 30_000;
    },
  });

  const deployments = data ?? [];

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: projectKeys.deployments(projectId),
    });
    await refetch();
  };

  return {
    deployments,
    loading: isLoading,
    error: error
      ? ((error as { message?: string }).message ?? "Erreur inconnue")
      : null,
    refresh,
  };
}

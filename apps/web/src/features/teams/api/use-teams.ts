"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { teamsService } from "@/features/teams/api/teams.service";
import { getApiErrorMessage } from "@/shared/lib/api";

/** Clé de cache du détail d'une équipe. */
export const teamKey = (id: string) => ["team", id] as const;

/** Liste des équipes (React Query — cache + invalidation centralisés). */
export function useTeams() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["teams"],
    queryFn: () => teamsService.getAll(),
  });

  return {
    teams: data ?? [],
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      await refetch();
    },
  };
}

/** Détail d'une équipe. Inactif tant que `enabled` est faux (ex. auth en cours). */
export function useTeam(id: string, enabled = true) {
  return useQuery({
    queryKey: teamKey(id),
    queryFn: () => teamsService.getById(id),
    enabled: Boolean(id) && enabled,
  });
}

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import type { ProjectDetail, ProjectListItem } from '@/types/project';

type UseProjectsReturn = {
  projects: ProjectListItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useProjects(): UseProjectsReturn {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsService.getAll(),
    refetchInterval: 30_000,
  });

  return {
    projects: data ?? [],
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await refetch();
    },
  };
}

type UseProjectReturn = {
  project: ProjectDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useProject(id: string): UseProjectReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsService.getById(id),
    enabled: Boolean(id),
  });

  return {
    project: data ?? null,
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => { await refetch(); },
  };
}

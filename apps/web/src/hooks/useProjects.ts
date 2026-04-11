'use client';

import { useCallback, useEffect, useState } from 'react';
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
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectsService.getAll();
      setProjects(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, error, refresh: fetchProjects };
}

type UseProjectReturn = {
  project: ProjectDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useProject(id: string): UseProjectReturn {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectsService.getById(id);
      setProject(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  return { project, loading, error, refresh: fetchProject };
}

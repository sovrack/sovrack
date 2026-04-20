'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/lib/api';
import { deploymentsService } from '@/services/deployments.service';
import type { Deployment } from '@/types/deployment';

export function useProjectDeployments(projectId: string) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await deploymentsService.getByProject(projectId);
      setDeployments(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setDeployments([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    deployments,
    loading,
    error,
    refresh,
  };
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

type DashboardStats = {
  projects: number;
  deployments: number;
  servers: number | 'N/A';
};

export function useDashboardStats() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    projects: 0,
    deployments: 0,
    servers: isAdmin ? 0 : 'N/A',
  });

  const fetchStats = useCallback(async () => {
    setLoading(true);

    try {
      const [projectsRes, deploymentsRes, serversRes] = await Promise.all([
        apiClient.get('/projects'),
        apiClient.get('/deployments'),
        isAdmin ? apiClient.get('/servers') : Promise.resolve({ data: [] }),
      ]);

      const projectsCount = Array.isArray(projectsRes.data)
        ? projectsRes.data.length
        : 0;
      const deploymentsCount = Array.isArray(deploymentsRes.data)
        ? deploymentsRes.data.length
        : 0;
      const serversCount = isAdmin
        ? Array.isArray(serversRes.data)
          ? serversRes.data.length
          : 0
        : 'N/A';

      setStats({
        projects: projectsCount,
        deployments: deploymentsCount,
        servers: serversCount,
      });
    } catch {
      setStats({
        projects: 0,
        deployments: 0,
        servers: isAdmin ? 0 : 'N/A',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    refresh: fetchStats,
  };
}

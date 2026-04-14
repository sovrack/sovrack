'use client';

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { RecentDeployment, DeploymentStatus } from '@/components/dashboard/recent-deployments';

type DayData = {
  label: string;
  total: number;
  success: number;
};

type DashboardStats = {
  projects: number;
  deployments: number;
  servers: number | 'N/A';
  successRate: number;
};

type DashboardData = {
  stats: DashboardStats;
  recentDeployments: RecentDeployment[];
  deploymentsChart: DayData[];
  loading: boolean;
  error: string | null;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildChartData(deployments: ApiDeployment[]): DayData[] {
  const today = new Date();
  const days: DayData[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayLabel = DAYS[d.getDay()];
    const dayStr = d.toISOString().slice(0, 10);

    const dayDeploys = deployments.filter(
      (dep) => dep.createdAt?.slice(0, 10) === dayStr,
    );

    days.push({
      label: dayLabel,
      total: dayDeploys.length,
      success: dayDeploys.filter((dep) => dep.status === 'SUCCESS').length,
    });
  }

  return days;
}

type ApiDeployment = {
  id: string;
  status: DeploymentStatus;
  branch?: string;
  createdAt?: string;
  environment?: {
    name?: string;
  };
  project?: {
    id?: string;
    name?: string;
  };
};

function toRecentDeployment(d: ApiDeployment): RecentDeployment {
  return {
    id: d.id,
    projectName: d.project?.name ?? 'Unknown project',
    branch: d.branch ?? 'main',
    environment: d.environment?.name ?? 'STAGING',
    status: d.status,
    createdAt: d.createdAt ?? new Date().toISOString(),
  };
}

export function useDashboardStats(): DashboardData & { refresh: () => void } {
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    projects: 0,
    deployments: 0,
    servers: isAdmin ? 0 : 'N/A',
    successRate: 0,
  });
  const [recentDeployments, setRecentDeployments] = useState<RecentDeployment[]>([]);
  const [deploymentsChart, setDeploymentsChart] = useState<DayData[]>(
    DAYS.map((label) => ({ label, total: 0, success: 0 })),
  );

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [projectsRes, deploymentsRes, serversRes] = await Promise.all([
        apiClient.get<unknown[]>('/projects'),
        apiClient.get<ApiDeployment[]>('/deployments'),
        isAdmin
          ? apiClient.get<unknown[]>('/servers')
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      const projects = Array.isArray(projectsRes.data) ? projectsRes.data : [];
      const deployments: ApiDeployment[] = Array.isArray(deploymentsRes.data)
        ? deploymentsRes.data
        : [];
      const servers = isAdmin
        ? Array.isArray(serversRes.data)
          ? serversRes.data
          : []
        : [];

      const successCount = deployments.filter((d) => d.status === 'SUCCESS').length;
      const finishedCount = deployments.filter(
        (d) => d.status === 'SUCCESS' || d.status === 'FAILED',
      ).length;
      const successRate =
        finishedCount > 0 ? Math.round((successCount / finishedCount) * 100) : 0;

      setStats({
        projects: projects.length,
        deployments: deployments.length,
        servers: isAdmin ? servers.length : 'N/A',
        successRate,
      });

      // Recent: last 5 deployments sorted by date desc
      const sorted = [...deployments].sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      );
      setRecentDeployments(sorted.slice(0, 5).map(toRecentDeployment));

      // Chart: last 7 days
      setDeploymentsChart(buildChartData(deployments));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return {
    stats,
    recentDeployments,
    deploymentsChart,
    loading,
    error,
    refresh: fetchStats,
  };
}

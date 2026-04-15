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
  verifiedServers: number | 'N/A';
  successRate: number;
  gitlabConnectedProjects: number;
  readyProjects: number;
  usersTotal: number | 'N/A';
  activeDevelopers: number | 'N/A';
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

type ApiProject = {
  id: string;
  gitlabId?: number | null;
  gitlabGroupId?: number | null;
  hasGitlabConfig?: boolean;
  environmentCount?: number;
};

type ApiServer = {
  id: string;
  isVerified?: boolean;
};

type ApiUser = {
  id: string;
  role: 'ADMIN' | 'DEVELOPER';
  isActive: boolean;
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

function isProjectGitlabConnected(project: ApiProject): boolean {
  const hasConfig = project.hasGitlabConfig ?? false;
  const hasSourceIdentifier =
    typeof project.gitlabId === 'number' ||
    typeof project.gitlabGroupId === 'number';

  return hasConfig && hasSourceIdentifier;
}

export function useDashboardStats(): DashboardData & { refresh: () => void } {
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    projects: 0,
    deployments: 0,
    servers: isAdmin ? 0 : 'N/A',
    verifiedServers: isAdmin ? 0 : 'N/A',
    successRate: 0,
    gitlabConnectedProjects: 0,
    readyProjects: 0,
    usersTotal: isAdmin ? 0 : 'N/A',
    activeDevelopers: isAdmin ? 0 : 'N/A',
  });
  const [recentDeployments, setRecentDeployments] = useState<RecentDeployment[]>([]);
  const [deploymentsChart, setDeploymentsChart] = useState<DayData[]>(
    DAYS.map((label) => ({ label, total: 0, success: 0 })),
  );

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [projectsRes, deploymentsRes, serversRes, usersRes] = await Promise.all([
        apiClient.get<unknown[]>('/projects'),
        apiClient.get<ApiDeployment[]>('/deployments'),
        isAdmin
          ? apiClient.get<unknown[]>('/servers')
          : Promise.resolve({ data: [] as unknown[] }),
        isAdmin
          ? apiClient.get<ApiUser[]>('/users')
          : Promise.resolve({ data: [] as ApiUser[] }),
      ]);

      const projects: ApiProject[] = Array.isArray(projectsRes.data)
        ? (projectsRes.data as ApiProject[])
        : [];
      const deployments: ApiDeployment[] = Array.isArray(deploymentsRes.data)
        ? deploymentsRes.data
        : [];
      const servers: ApiServer[] = isAdmin
        ? Array.isArray(serversRes.data)
          ? (serversRes.data as ApiServer[])
          : []
        : [];
      const users = isAdmin
        ? Array.isArray(usersRes.data)
          ? usersRes.data
          : []
        : [];

      const successCount = deployments.filter((d) => d.status === 'SUCCESS').length;
      const finishedCount = deployments.filter(
        (d) => d.status === 'SUCCESS' || d.status === 'FAILED',
      ).length;
      const successRate =
        finishedCount > 0 ? Math.round((successCount / finishedCount) * 100) : 0;
      const gitlabConnectedProjects = projects.filter(
        isProjectGitlabConnected,
      ).length;
      const readyProjects = projects.filter(
        (project) =>
          isProjectGitlabConnected(project) &&
          (project.environmentCount ?? 0) > 0,
      ).length;
      const verifiedServers = isAdmin
        ? servers.filter((server) => server.isVerified).length
        : 'N/A';

      setStats({
        projects: projects.length,
        deployments: deployments.length,
        servers: isAdmin ? servers.length : 'N/A',
        verifiedServers,
        successRate,
        gitlabConnectedProjects,
        readyProjects,
        usersTotal: isAdmin ? users.length : 'N/A',
        activeDevelopers: isAdmin
          ? users.filter((item) => item.role === 'DEVELOPER' && item.isActive)
              .length
          : 'N/A',
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

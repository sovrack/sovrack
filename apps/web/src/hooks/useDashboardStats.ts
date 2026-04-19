'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
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

const DEFAULT_STATS: DashboardStats = {
  projects: 0,
  deployments: 0,
  servers: 'N/A',
  verifiedServers: 'N/A',
  successRate: 0,
  gitlabConnectedProjects: 0,
  readyProjects: 0,
  usersTotal: 'N/A',
  activeDevelopers: 'N/A',
};

type ApiDeployment = {
  id: string;
  status: DeploymentStatus;
  branch?: string;
  createdAt?: string;
  environment?: { name?: string };
  project?: { id?: string; name?: string };
};

type ApiProject = {
  id: string;
  gitlabId?: number | null;
  gitlabGroupId?: number | null;
  hasGitlabConfig?: boolean;
  environmentCount?: number;
};

type ApiServer = { id: string; isVerified?: boolean };
type ApiUser = { id: string; role: 'ADMIN' | 'DEVELOPER'; isActive: boolean };

function buildChartData(deployments: ApiDeployment[]): DayData[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const dayStr = d.toISOString().slice(0, 10);
    const dayDeploys = deployments.filter((dep) => dep.createdAt?.slice(0, 10) === dayStr);
    return {
      label: DAYS[d.getDay()],
      total: dayDeploys.length,
      success: dayDeploys.filter((dep) => dep.status === 'SUCCESS').length,
    };
  });
}

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
  return (
    (project.hasGitlabConfig ?? false) &&
    (typeof project.gitlabId === 'number' || typeof project.gitlabGroupId === 'number')
  );
}

async function fetchDashboardData(isAdmin: boolean) {
  const [projectsRes, deploymentsRes, serversRes, usersRes] = await Promise.all([
    apiClient.get<ApiProject[]>('/projects'),
    apiClient.get<ApiDeployment[]>('/deployments'),
    isAdmin ? apiClient.get<ApiServer[]>('/servers') : Promise.resolve({ data: [] as ApiServer[] }),
    isAdmin ? apiClient.get<ApiUser[]>('/users') : Promise.resolve({ data: [] as ApiUser[] }),
  ]);

  const projects = Array.isArray(projectsRes.data) ? projectsRes.data : [];
  const deployments = Array.isArray(deploymentsRes.data) ? deploymentsRes.data : [];
  const servers = isAdmin && Array.isArray(serversRes.data) ? serversRes.data : [];
  const users = isAdmin && Array.isArray(usersRes.data) ? usersRes.data : [];

  const successCount = deployments.filter((d) => d.status === 'SUCCESS').length;
  const finishedCount = deployments.filter((d) => d.status === 'SUCCESS' || d.status === 'FAILED').length;
  const successRate = finishedCount > 0 ? Math.round((successCount / finishedCount) * 100) : 0;
  const gitlabConnectedProjects = projects.filter(isProjectGitlabConnected).length;
  const readyProjects = projects.filter((p) => isProjectGitlabConnected(p) && (p.environmentCount ?? 0) > 0).length;

  const stats: DashboardStats = {
    projects: projects.length,
    deployments: deployments.length,
    servers: isAdmin ? servers.length : 'N/A',
    verifiedServers: isAdmin ? servers.filter((s) => s.isVerified).length : 'N/A',
    successRate,
    gitlabConnectedProjects,
    readyProjects,
    usersTotal: isAdmin ? users.length : 'N/A',
    activeDevelopers: isAdmin ? users.filter((u) => u.role === 'DEVELOPER' && u.isActive).length : 'N/A',
  };

  const sorted = [...deployments].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );

  return {
    stats,
    recentDeployments: sorted.slice(0, 5).map(toRecentDeployment),
    deploymentsChart: buildChartData(deployments),
  };
}

export function useDashboardStats(): DashboardData & { refresh: () => void } {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', isAdmin],
    queryFn: () => fetchDashboardData(isAdmin),
  });

  return {
    stats: data?.stats ?? DEFAULT_STATS,
    recentDeployments: data?.recentDeployments ?? [],
    deploymentsChart: data?.deploymentsChart ?? DAYS.map((label) => ({ label, total: 0, success: 0 })),
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void refetch();
    },
  };
}

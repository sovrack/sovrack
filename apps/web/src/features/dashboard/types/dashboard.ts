export type DayActivity = {
  date: string;
  total: number;
  success: number;
  failed: number;
};

export type TopProject = {
  id: string;
  name: string;
  deployCount: number;
  lastDeployedAt: string | null;
  successRate: number;
};

export type DashboardStats = {
  kpis: {
    totalProjects: number;
    totalEnvironments: number;
    totalServers: number;
    deploymentsLast7d: number;
    deploymentsLast30d: number;
    successRate7d: number;
    avgDurationSeconds: number | null;
    runningCount: number;
    failedCount: number;
    idleProjectsCount: number;
  };
  activity: DayActivity[];
  topProjects: TopProject[];
  servers: {
    total: number;
    ready: number;
    preparing: number;
    error: number;
    offline: number;
  };
  recentFailures: {
    id: string;
    projectName: string;
    environmentName: string;
    branch: string;
    createdAt: string;
  }[];
};

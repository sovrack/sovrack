export type MonitoringHealth = "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";

export type MonitoringOverview = {
  generatedAt: string;
  totalMonitoredServers: number;
  healthy: number;
  warning: number;
  critical: number;
  unknown: number;
  grafana: {
    configured: boolean;
    reachable: boolean;
    url: string | null;
    message: string;
    version: string | null;
  };
  prometheus: {
    configured: boolean;
    reachable: boolean;
    url: string | null;
    message: string;
    totalTargets: number;
    upTargets: number;
    downTargets: number;
  };
};

export type MonitoredServer = {
  serverId: string;
  name: string;
  host: string;
  platformStatus: string;
  monitoringStatus: MonitoringHealth;
  // B4/E2 : stack Prometheus/Grafana/Loki installée SUR ce serveur → liens
  // déduits de son host ; null si non installée.
  monitoringInstalledAt: string | null;
  links: {
    grafanaUrl: string;
    prometheusUrl: string;
    lokiUrl: string;
  } | null;
  lastCheckAt: string | null;
  metrics: {
    up: number | null;
    cpuPercent: number | null;
    memoryPercent: number | null;
    diskPercent: number | null;
    networkRxBytesPerSec: number | null;
    networkTxBytesPerSec: number | null;
    uptimeSeconds: number | null;
  };
  docker: {
    enabled: boolean;
    runnerEnabled: boolean;
  };
  linkedProjects: Array<{
    id: string;
    name: string;
  }>;
  deployment: {
    lastStatus: string | null;
    lastDeploymentAt: string | null;
    failedInLast7d: number;
    successInLast7d: number;
  };
  blockingReasons: string[];
};

export type MonitoredProject = {
  projectId: string;
  name: string;
  linkedServers: number;
  latestDeploymentStatus: string | null;
  latestDeploymentAt: string | null;
  deploymentsLast7d: number;
  failedDeployments7d: number;
  successRate7d: number | null;
  pipelineStatusCounts: Record<string, number>;
  health: MonitoringHealth;
};

export type MonitoringDeployments = {
  generatedAt: string;
  stats: {
    total: number;
    pending: number;
    running: number;
    succeeded: number;
    failed: number;
    canceled: number;
    successRate7d: number | null;
  };
  recent: Array<{
    id: string;
    status: string;
    buildStatus: string;
    branch: string;
    dockerImage: string | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    project: {
      id: string;
      name: string;
    };
    environment: {
      id: string;
      name: string;
    };
    server: {
      id: string;
      name: string;
      host: string;
    };
  }>;
};

export type MonitoringAlerts = {
  source: "alertmanager" | "derived";
  total: number;
  warning: number;
  critical: number;
  info: number;
  items: Array<{
    id: string;
    severity: "warning" | "critical" | "info";
    status: "firing" | "resolved";
    summary: string;
    source: "alertmanager" | "platform";
    startsAt: string;
    serverId?: string;
    projectId?: string;
  }>;
};

export type MonitoringInstallOptions = {
  executionModel: string;
  actions: Array<{
    key: string;
    label: string;
    description: string;
    category: string;
    roles?: string[];
  }>;
  servers: Array<{
    id: string;
    name: string;
    host: string;
    status: string;
    isVerified: boolean;
  }>;
};

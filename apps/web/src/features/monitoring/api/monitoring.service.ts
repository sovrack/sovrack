import api from "@/shared/lib/api";
import type {
  MonitoredProject,
  MonitoredServer,
  MonitoringAlerts,
  MonitoringDeployments,
  MonitoringInstallOptions,
  MonitoringOverview,
} from "@/features/monitoring/types/monitoring";

export const monitoringService = {
  async getOverview(): Promise<MonitoringOverview> {
    const res = await api.get<MonitoringOverview>("/monitoring/overview");
    return res.data;
  },

  async getServers(): Promise<MonitoredServer[]> {
    const res = await api.get<MonitoredServer[]>("/monitoring/servers");
    return res.data;
  },

  async getProjects(): Promise<MonitoredProject[]> {
    const res = await api.get<MonitoredProject[]>("/monitoring/projects");
    return res.data;
  },

  async getDeployments(): Promise<MonitoringDeployments> {
    const res = await api.get<MonitoringDeployments>("/monitoring/deployments");
    return res.data;
  },

  async getAlerts(): Promise<MonitoringAlerts> {
    const res = await api.get<MonitoringAlerts>("/monitoring/alerts");
    return res.data;
  },

  async getPrometheusStatus() {
    const res = await api.get("/monitoring/prometheus/status");
    return res.data;
  },

  async getGrafanaStatus() {
    const res = await api.get("/monitoring/grafana/status");
    return res.data;
  },

  async getInstallOptions(): Promise<MonitoringInstallOptions> {
    const res = await api.get<MonitoringInstallOptions>(
      "/monitoring/install/options",
    );
    return res.data;
  },

  async installMonitoring(payload: {
    actionKey: string;
    serverIds: string[];
  }): Promise<{ id: string; status: string }> {
    const res = await api.post<{ id: string; status: string }>(
      "/monitoring/install",
      payload,
    );
    return res.data;
  },

  async getContainerInfo(
    deploymentId: string,
    tail = 200,
  ): Promise<ContainerInfo> {
    const res = await api.get<ContainerInfo>(
      `/monitoring/containers/deployment/${deploymentId}?tail=${String(tail)}`,
    );
    return res.data;
  },

  async listProjectContainers(
    projectId: string,
    serverId: string,
  ): Promise<ContainerStats[]> {
    const res = await api.get<ContainerStats[]>(
      `/monitoring/containers/project/${projectId}?serverId=${encodeURIComponent(serverId)}`,
    );
    return res.data;
  },

  // Historique CPU/mémoire d'un service-environnement (Prometheus query_range).
  // Vide (configured:false) si la stack Prometheus n'est pas installée.
  async getServiceMetricRange(
    serviceEnvId: string,
    minutes = 60,
    step = 60,
  ): Promise<ServiceMetricRange> {
    const res = await api.get<ServiceMetricRange>(
      `/monitoring/services/${serviceEnvId}/metrics/range`,
      { params: { minutes, step } },
    );
    return res.data;
  },

  // B5 : liens monitoring (Grafana/Prometheus/Loki) du SERVEUR qui héberge ce
  // service-environnement — résolus par serveur (monitoringInstalledAt),
  // fallback config plateforme.
  async getServiceMonitoringLinks(
    serviceEnvId: string,
  ): Promise<ServiceMonitoringLinks> {
    const res = await api.get<ServiceMonitoringLinks>(
      `/monitoring/services/${serviceEnvId}/links`,
    );
    return res.data;
  },
};

export type ServiceMonitoringLinks = {
  installed: boolean;
  source: "server" | "platform" | null;
  serverHost: string | null;
  grafanaUrl: string | null;
  prometheusUrl: string | null;
  lokiUrl: string | null;
};

export type MetricRangePoint = { t: number; value: number | null };
export type ServiceMetricRange = {
  configured: boolean;
  serviceEnvId: string;
  from: number;
  to: number;
  stepSeconds: number;
  series: {
    cpuPercent: MetricRangePoint[];
    memoryMb: MetricRangePoint[];
  };
};

export type ContainerStats = {
  containerId: string;
  name: string;
  cpuPercent: string;
  memUsage: string;
  memPercent: string;
  netIO: string;
  blockIO: string;
  pids: string;
  status: "running" | "stopped" | "not_found" | "unknown";
};

export type ContainerInfo = {
  stats: ContainerStats | null;
  logs: string;
  status: "running" | "stopped" | "not_found" | "unknown";
};

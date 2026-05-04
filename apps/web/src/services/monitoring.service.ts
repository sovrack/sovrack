import api from '@/lib/api';
import type {
  MonitoredProject,
  MonitoredServer,
  MonitoringAlerts,
  MonitoringDeployments,
  MonitoringInstallOptions,
  MonitoringOverview,
} from '@/types/monitoring';

export const monitoringService = {
  async getOverview(): Promise<MonitoringOverview> {
    const res = await api.get<MonitoringOverview>('/monitoring/overview');
    return res.data;
  },

  async getServers(): Promise<MonitoredServer[]> {
    const res = await api.get<MonitoredServer[]>('/monitoring/servers');
    return res.data;
  },

  async getProjects(): Promise<MonitoredProject[]> {
    const res = await api.get<MonitoredProject[]>('/monitoring/projects');
    return res.data;
  },

  async getDeployments(): Promise<MonitoringDeployments> {
    const res = await api.get<MonitoringDeployments>('/monitoring/deployments');
    return res.data;
  },

  async getAlerts(): Promise<MonitoringAlerts> {
    const res = await api.get<MonitoringAlerts>('/monitoring/alerts');
    return res.data;
  },

  async getPrometheusStatus() {
    const res = await api.get('/monitoring/prometheus/status');
    return res.data;
  },

  async getGrafanaStatus() {
    const res = await api.get('/monitoring/grafana/status');
    return res.data;
  },

  async getInstallOptions(): Promise<MonitoringInstallOptions> {
    const res = await api.get<MonitoringInstallOptions>('/monitoring/install/options');
    return res.data;
  },

  async installMonitoring(payload: {
    actionKey: string;
    serverIds: string[];
  }): Promise<unknown> {
    const res = await api.post('/monitoring/install', payload);
    return res.data;
  },
};

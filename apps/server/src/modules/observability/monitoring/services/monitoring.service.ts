import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ServerOperationStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../../core/database/prisma.service';
import { PlatformService } from '../../../platform/platform.service';
import { CreateAutomationRunDto } from '../../../automation/dto/create-automation-run.dto';
import { AUTOMATION_ACTIONS } from '../../../automation/shared/automation-options';
import {
  AUTOMATION_RUN_COMPLETED,
  type AutomationRunCompletedEvent,
} from '../../../automation/shared/automation-events';
import { AutomationService } from '../../../automation/services/automation.service';
import { InstallMonitoringDto } from '../dto/install-monitoring.dto';
import { MonitoringStatsService } from './monitoring-stats.service';
import { MonitoringPrometheusService } from './monitoring-prometheus.service';

type MonitoringMetricSnapshot = {
  up: number | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  networkRxBytesPerSec: number | null;
  networkTxBytesPerSec: number | null;
  uptimeSeconds: number | null;
};

type PrometheusVectorSample = {
  metric?: Record<string, string>;
  value?: [number | string, string];
};

type AlertItem = {
  id: string;
  severity: 'warning' | 'critical' | 'info';
  status: 'firing' | 'resolved';
  summary: string;
  source: 'alertmanager' | 'platform';
  startsAt: string;
  serverId?: string;
  projectId?: string;
};

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly platformConfig: PlatformService,
    private readonly automation: AutomationService,
    private readonly statsService: MonitoringStatsService,
    private readonly prometheusService: MonitoringPrometheusService,
  ) {}

  async getOverview() {
    const [servers, prometheusStatus, grafanaStatus] = await Promise.all([
      this.getServerMonitoring(),
      this.getPrometheusStatus(),
      this.getGrafanaStatus(),
    ]);

    const totals = servers.reduce(
      (acc, server) => {
        acc.total += 1;
        if (server.monitoringStatus === 'HEALTHY') acc.healthy += 1;
        if (server.monitoringStatus === 'WARNING') acc.warning += 1;
        if (server.monitoringStatus === 'CRITICAL') acc.critical += 1;
        if (server.monitoringStatus === 'UNKNOWN') acc.unknown += 1;
        return acc;
      },
      { total: 0, healthy: 0, warning: 0, critical: 0, unknown: 0 },
    );

    return {
      generatedAt: new Date().toISOString(),
      totalMonitoredServers: totals.total,
      healthy: totals.healthy,
      warning: totals.warning,
      critical: totals.critical,
      unknown: totals.unknown,
      grafana: grafanaStatus,
      prometheus: prometheusStatus,
    };
  }

  async getServerMonitoring() {
    const metricByHost =
      await this.prometheusService.fetchPrometheusMetricsByHost();
    return await this.statsService.getServerMonitoring(metricByHost);
  }

  async getProjectMonitoring() {
    return await this.statsService.getProjectMonitoring();
  }

  async getDeploymentMonitoring() {
    return await this.statsService.getDeploymentMonitoring();
  }

  async getPrometheusStatus() {
    return await this.prometheusService.getPrometheusStatus();
  }

  async getGrafanaStatus() {
    const grafanaUrl = await this.getConfigValue('MONITORING_GRAFANA_URL');
    const grafanaUsername = await this.getConfigValue(
      'MONITORING_GRAFANA_USERNAME',
    );
    const grafanaPassword = await this.getConfigValue(
      'MONITORING_GRAFANA_PASSWORD',
    );

    if (!grafanaUrl) {
      return {
        configured: false,
        reachable: false,
        url: null,
        message: 'Grafana URL is not configured.',
        version: null,
      };
    }

    const normalizedUrl = this.trimTrailingSlash(grafanaUrl);
    const auth =
      grafanaUsername && grafanaPassword
        ? {
            username: grafanaUsername,
            password: grafanaPassword,
          }
        : undefined;

    try {
      const healthRes = await firstValueFrom(
        this.httpService.get<{ version?: string; message?: string }>(
          `${normalizedUrl}/api/health`,
          {
            timeout: 5_000,
            ...(auth ? { auth } : {}),
          },
        ),
      );

      return {
        configured: true,
        reachable: true,
        url: normalizedUrl,
        message: healthRes.data?.message ?? 'Grafana is reachable.',
        version: healthRes.data?.version ?? null,
      };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        url: normalizedUrl,
        message: `Grafana is unreachable: ${this.errorMessage(error)}`,
        version: null,
      };
    }
  }

  async getAlerts() {
    const alertmanagerUrl = await this.getConfigValue(
      'MONITORING_ALERTMANAGER_URL',
    );
    if (alertmanagerUrl) {
      try {
        const normalized = this.trimTrailingSlash(alertmanagerUrl);
        const res = await firstValueFrom(
          this.httpService.get<
            Array<{
              fingerprint?: string;
              status?: { state?: string };
              labels?: Record<string, string>;
              annotations?: Record<string, string>;
              startsAt?: string;
            }>
          >(`${normalized}/api/v2/alerts`, { timeout: 5_000 }),
        );

        const items: AlertItem[] = (res.data ?? []).map((alert) => {
          const severityLabel =
            alert.labels?.severity?.toLowerCase() ?? 'warning';
          const severity: AlertItem['severity'] =
            severityLabel === 'critical'
              ? 'critical'
              : severityLabel === 'info'
                ? 'info'
                : 'warning';

          return {
            id: alert.fingerprint ?? randomUUID(),
            severity,
            status: alert.status?.state === 'resolved' ? 'resolved' : 'firing',
            summary:
              alert.annotations?.summary ??
              alert.annotations?.description ??
              'Monitoring alert',
            source: 'alertmanager',
            startsAt: alert.startsAt ?? new Date().toISOString(),
          };
        });

        return {
          source: 'alertmanager',
          total: items.length,
          warning: items.filter((item) => item.severity === 'warning').length,
          critical: items.filter((item) => item.severity === 'critical').length,
          info: items.filter((item) => item.severity === 'info').length,
          items,
        };
      } catch (error) {
        this.logger.warn(
          `Alertmanager fetch failed: ${this.errorMessage(error)}`,
        );
      }
    }

    return await this.statsService.getDerivedAlerts();
  }

  async getInstallOptions() {
    return await this.statsService.getInstallOptions();
  }

  async installMonitoring(
    dto: InstallMonitoringDto,
    actorId: string,
  ): Promise<unknown> {
    const action = AUTOMATION_ACTIONS.find(
      (item) => item.key === dto.actionKey,
    );
    if (!action || action.category !== 'monitoring') {
      throw new BadRequestException(
        'Unsupported monitoring automation action.',
      );
    }

    const payload: CreateAutomationRunDto = {
      actionKey: dto.actionKey,
      serverIds: dto.serverIds,
    };

    return await this.automation.startRun(payload, actorId);
  }

  /**
   * Une fois la stack monitoring installée avec succès sur un serveur, on câble
   * automatiquement les URLs Prometheus/Grafana en config plateforme → la page
   * monitoring passe en « mode complet » sans étape manuelle. (Ne surcharge pas
   * une URL déjà configurée par l'admin, ex. Grafana externe.)
   */
  @OnEvent(AUTOMATION_RUN_COMPLETED)
  async onAutomationRunCompleted(
    event: AutomationRunCompletedEvent,
  ): Promise<void> {
    const action = AUTOMATION_ACTIONS.find((a) => a.key === event.actionKey);
    if (!action || action.category !== 'monitoring') return;
    const installsStack = (action.roles ?? []).some((r) =>
      ['prometheus', 'grafana'].includes(r),
    );
    if (!installsStack) return;
    if (
      event.status !== ServerOperationStatus.SUCCEEDED &&
      event.status !== ServerOperationStatus.PARTIAL
    ) {
      return;
    }
    const host = event.succeededHosts[0];
    if (!host) return;

    const setIfAbsent = async (key: string, value: string) => {
      const current = await this.platformConfig.get(key);
      if (!current || current.trim().length === 0) {
        await this.platformConfig.set(key, value);
      }
    };
    await setIfAbsent('MONITORING_PROMETHEUS_URL', `http://${host}:9090`);
    await setIfAbsent('MONITORING_GRAFANA_URL', `http://${host}:3000`);
    this.logger.log(
      `Monitoring stack installed on ${host} → URLs Prometheus/Grafana câblées.`,
    );
  }

  private async fetchPrometheusMetricsByHost(): Promise<
    Map<string, MonitoringMetricSnapshot>
  > {
    const prometheusUrl = await this.getConfigValue(
      'MONITORING_PROMETHEUS_URL',
    );
    if (!prometheusUrl) {
      return new Map();
    }

    const normalized = this.trimTrailingSlash(prometheusUrl);

    const [
      upValues,
      cpuValues,
      memoryValues,
      diskValues,
      rxValues,
      txValues,
      uptimeValues,
    ] = await Promise.all([
      this.queryPrometheus(normalized, 'up{job=~".*node.*exporter.*"}'),
      this.queryPrometheus(
        normalized,
        '100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))',
      ),
      this.queryPrometheus(
        normalized,
        '100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))',
      ),
      this.queryPrometheus(
        normalized,
        '100 * (1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}))',
      ),
      this.queryPrometheus(
        normalized,
        'sum by(instance) (rate(node_network_receive_bytes_total{device!~"lo"}[5m]))',
      ),
      this.queryPrometheus(
        normalized,
        'sum by(instance) (rate(node_network_transmit_bytes_total{device!~"lo"}[5m]))',
      ),
      this.queryPrometheus(
        normalized,
        '(node_time_seconds - node_boot_time_seconds)',
      ),
    ]);

    const metricMap = new Map<string, MonitoringMetricSnapshot>();

    const setValue = (
      host: string,
      key: keyof MonitoringMetricSnapshot,
      value: number | null,
    ) => {
      const current = metricMap.get(host) ?? this.emptyMetricSnapshot();
      metricMap.set(host, { ...current, [key]: value });
    };

    const apply = (
      samples: PrometheusVectorSample[],
      key: keyof MonitoringMetricSnapshot,
    ) => {
      for (const sample of samples) {
        const instance = sample.metric?.instance;
        const host = instance ? this.extractHostFromInstance(instance) : null;
        const rawValue = sample.value?.[1];
        if (!host || rawValue === undefined) {
          continue;
        }
        const parsed = Number(rawValue);
        setValue(host, key, Number.isFinite(parsed) ? parsed : null);
      }
    };

    apply(upValues, 'up');
    apply(cpuValues, 'cpuPercent');
    apply(memoryValues, 'memoryPercent');
    apply(diskValues, 'diskPercent');
    apply(rxValues, 'networkRxBytesPerSec');
    apply(txValues, 'networkTxBytesPerSec');
    apply(uptimeValues, 'uptimeSeconds');

    return metricMap;
  }

  private async queryPrometheus(
    prometheusUrl: string,
    query: string,
  ): Promise<PrometheusVectorSample[]> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<{
          status?: string;
          data?: {
            resultType?: string;
            result?: PrometheusVectorSample[];
          };
        }>(`${prometheusUrl}/api/v1/query`, {
          params: { query },
          timeout: 5_000,
        }),
      );

      const result = res.data?.data?.result;
      return Array.isArray(result) ? result : [];
    } catch (error) {
      this.logger.warn(
        `Prometheus query failed (${query}): ${this.errorMessage(error)}`,
      );
      return [];
    }
  }

  private extractHostFromInstance(instance: string): string {
    const trimmed = instance.trim();

    if (trimmed.startsWith('[') && trimmed.includes(']:')) {
      return trimmed.slice(1, trimmed.indexOf(']:')).toLowerCase();
    }

    const parts = trimmed.split(':');
    if (parts.length <= 2) {
      return parts[0].toLowerCase();
    }

    return trimmed.toLowerCase();
  }

  private emptyMetricSnapshot(): MonitoringMetricSnapshot {
    return {
      up: null,
      cpuPercent: null,
      memoryPercent: null,
      diskPercent: null,
      networkRxBytesPerSec: null,
      networkTxBytesPerSec: null,
      uptimeSeconds: null,
    };
  }

  private trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
  }

  private async getConfigValue(key: string): Promise<string | null> {
    const value = await this.platformConfig.get(key);
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

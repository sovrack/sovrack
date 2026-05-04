import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DeploymentStatus, PipelineStatus, ServerStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlatformConfigService } from '../../platform-config/platform-config.service';
import { CreateAutomationRunDto } from '../../automation/dto/create-automation-run.dto';
import { AUTOMATION_ACTIONS } from '../../automation/shared/automation-options';
import { AutomationService } from '../../automation/services/automation.service';
import { InstallMonitoringDto } from '../dto/install-monitoring.dto';

type MonitoringHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

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
    private readonly platformConfig: PlatformConfigService,
    private readonly automation: AutomationService,
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
    const servers = await this.prisma.server.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        environments: {
          select: {
            projectId: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const [metricByHost, deploymentStatsByServer] = await Promise.all([
      this.fetchPrometheusMetricsByHost(),
      this.fetchDeploymentStatsByServer(),
    ]);

    return servers.map((server) => {
      const metrics =
        metricByHost.get(server.host) ?? this.emptyMetricSnapshot();
      const deploymentStats = deploymentStatsByServer.get(server.id) ?? {
        lastStatus: null,
        lastDeploymentAt: null,
        failedInLast7d: 0,
        successInLast7d: 0,
      };

      const blockingReasons = this.resolveBlockingReasons(server);
      const monitoringStatus = this.resolveServerHealth(
        server.status,
        server.isVerified,
        metrics,
      );

      return {
        serverId: server.id,
        name: server.name,
        host: server.host,
        platformStatus: server.status,
        monitoringStatus,
        lastCheckAt:
          metrics.up !== null ||
          metrics.cpuPercent !== null ||
          metrics.memoryPercent !== null ||
          metrics.diskPercent !== null
            ? new Date().toISOString()
            : null,
        metrics,
        docker: {
          enabled: server.hasDocker,
          runnerEnabled: server.hasRunner,
        },
        linkedProjects: server.environments.map((env) => ({
          id: env.project.id,
          name: env.project.name,
        })),
        deployment: deploymentStats,
        blockingReasons,
      };
    });
  }

  async getProjectMonitoring() {
    const projects = await this.prisma.project.findMany({
      orderBy: { name: 'asc' },
      include: {
        environments: {
          select: {
            id: true,
            serverId: true,
          },
        },
        deployments: {
          orderBy: { createdAt: 'desc' },
          select: {
            status: true,
            createdAt: true,
          },
        },
        pipelines: {
          orderBy: { createdAt: 'desc' },
          take: 25,
          select: {
            status: true,
          },
        },
      },
    });

    const sevenDaysAgo = this.daysAgo(7);

    return projects.map((project) => {
      const latestDeployment = project.deployments[0] ?? null;
      const deploymentsLast7d = project.deployments.filter(
        (deployment) => deployment.createdAt >= sevenDaysAgo,
      );
      const failedDeployments7d = deploymentsLast7d.filter(
        (deployment) =>
          deployment.status === DeploymentStatus.FAILED ||
          deployment.status === DeploymentStatus.CANCELED,
      ).length;
      const successDeployments7d = deploymentsLast7d.filter(
        (deployment) => deployment.status === DeploymentStatus.SUCCESS,
      ).length;
      const successRate7d =
        deploymentsLast7d.length > 0
          ? Math.round((successDeployments7d / deploymentsLast7d.length) * 100)
          : null;

      const pipelineStatusCounts = project.pipelines.reduce(
        (acc, pipeline) => {
          acc[pipeline.status] = (acc[pipeline.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<PipelineStatus, number>,
      );

      const health = this.resolveProjectHealth(
        latestDeployment?.status ?? null,
        failedDeployments7d,
      );

      return {
        projectId: project.id,
        name: project.name,
        linkedServers: Array.from(
          new Set(project.environments.map((env) => env.serverId)),
        ).length,
        latestDeploymentStatus: latestDeployment?.status ?? null,
        latestDeploymentAt: latestDeployment?.createdAt.toISOString() ?? null,
        deploymentsLast7d: deploymentsLast7d.length,
        failedDeployments7d,
        successRate7d,
        pipelineStatusCounts,
        health,
      };
    });
  }

  async getDeploymentMonitoring() {
    const deployments = await this.prisma.deployment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        project: {
          select: { id: true, name: true },
        },
        environment: {
          select: {
            id: true,
            name: true,
            server: {
              select: { id: true, name: true, host: true },
            },
          },
        },
      },
    });

    const sevenDaysAgo = this.daysAgo(7);
    const deploymentsLast7d = deployments.filter(
      (deployment) => deployment.createdAt >= sevenDaysAgo,
    );
    const success7d = deploymentsLast7d.filter(
      (deployment) => deployment.status === DeploymentStatus.SUCCESS,
    ).length;

    const stats = {
      total: deployments.length,
      pending: deployments.filter((d) => d.status === DeploymentStatus.PENDING)
        .length,
      running: deployments.filter((d) => d.status === DeploymentStatus.RUNNING)
        .length,
      succeeded: deployments.filter(
        (d) => d.status === DeploymentStatus.SUCCESS,
      ).length,
      failed: deployments.filter((d) => d.status === DeploymentStatus.FAILED)
        .length,
      canceled: deployments.filter(
        (d) => d.status === DeploymentStatus.CANCELED,
      ).length,
      successRate7d:
        deploymentsLast7d.length > 0
          ? Math.round((success7d / deploymentsLast7d.length) * 100)
          : null,
    };

    return {
      generatedAt: new Date().toISOString(),
      stats,
      recent: deployments.map((deployment) => ({
        id: deployment.id,
        status: deployment.status,
        buildStatus: deployment.buildStatus,
        branch: deployment.branch,
        dockerImage: deployment.dockerImage,
        createdAt: deployment.createdAt.toISOString(),
        startedAt: deployment.startedAt?.toISOString() ?? null,
        finishedAt: deployment.finishedAt?.toISOString() ?? null,
        project: deployment.project,
        environment: {
          id: deployment.environment.id,
          name: deployment.environment.name,
        },
        server: deployment.environment.server,
      })),
    };
  }

  async getPrometheusStatus() {
    const prometheusUrl = await this.getConfigValue(
      'MONITORING_PROMETHEUS_URL',
    );
    if (!prometheusUrl) {
      return {
        configured: false,
        reachable: false,
        url: null,
        message: 'Prometheus URL is not configured.',
        totalTargets: 0,
        upTargets: 0,
        downTargets: 0,
      };
    }

    const normalizedUrl = this.trimTrailingSlash(prometheusUrl);

    try {
      await firstValueFrom(
        this.httpService.get(`${normalizedUrl}/-/ready`, {
          timeout: 4_000,
        }),
      );

      const targetsRes = await firstValueFrom(
        this.httpService.get<{
          data?: { activeTargets?: Array<{ health?: string }> };
        }>(`${normalizedUrl}/api/v1/targets`, {
          timeout: 5_000,
        }),
      );

      const targets = targetsRes.data?.data?.activeTargets ?? [];
      const upTargets = targets.filter(
        (target) => target.health === 'up',
      ).length;
      const downTargets = Math.max(targets.length - upTargets, 0);

      return {
        configured: true,
        reachable: true,
        url: normalizedUrl,
        message: 'Prometheus is reachable.',
        totalTargets: targets.length,
        upTargets,
        downTargets,
      };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        url: normalizedUrl,
        message: `Prometheus is unreachable: ${this.errorMessage(error)}`,
        totalTargets: 0,
        upTargets: 0,
        downTargets: 0,
      };
    }
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

    return await this.getDerivedAlerts();
  }

  async getInstallOptions() {
    const actions = AUTOMATION_ACTIONS.filter(
      (action) => action.category === 'monitoring',
    );
    const servers = await this.prisma.server.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        host: true,
        status: true,
        isVerified: true,
      },
    });

    return {
      executionModel:
        'Control node only (Ansible remains on backend). Target VPS hosts remain agentless SSH targets.',
      actions,
      servers,
    };
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

  private async fetchDeploymentStatsByServer() {
    const deployments = await this.prisma.deployment.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        createdAt: true,
        environment: {
          select: {
            serverId: true,
          },
        },
      },
    });

    const sevenDaysAgo = this.daysAgo(7);
    const map = new Map<
      string,
      {
        lastStatus: DeploymentStatus | null;
        lastDeploymentAt: string | null;
        failedInLast7d: number;
        successInLast7d: number;
      }
    >();

    for (const deployment of deployments) {
      const serverId = deployment.environment.serverId;
      const current = map.get(serverId) ?? {
        lastStatus: null,
        lastDeploymentAt: null,
        failedInLast7d: 0,
        successInLast7d: 0,
      };

      if (!current.lastStatus) {
        current.lastStatus = deployment.status;
        current.lastDeploymentAt = deployment.createdAt.toISOString();
      }

      if (deployment.createdAt >= sevenDaysAgo) {
        if (
          deployment.status === DeploymentStatus.FAILED ||
          deployment.status === DeploymentStatus.CANCELED
        ) {
          current.failedInLast7d += 1;
        }
        if (deployment.status === DeploymentStatus.SUCCESS) {
          current.successInLast7d += 1;
        }
      }

      map.set(serverId, current);
    }

    return map;
  }

  private resolveServerHealth(
    status: ServerStatus,
    isVerified: boolean,
    metrics: MonitoringMetricSnapshot,
  ): MonitoringHealth {
    if (status === ServerStatus.UNREACHABLE) {
      return 'CRITICAL';
    }
    if (!isVerified) {
      return 'WARNING';
    }

    if (metrics.up === 0) {
      return 'CRITICAL';
    }

    const values = [
      metrics.cpuPercent,
      metrics.memoryPercent,
      metrics.diskPercent,
    ].filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );

    if (values.some((value) => value >= 95)) {
      return 'CRITICAL';
    }
    if (values.some((value) => value >= 85)) {
      return 'WARNING';
    }

    if (metrics.up !== null && metrics.up > 0) {
      return 'HEALTHY';
    }

    return 'UNKNOWN';
  }

  private resolveProjectHealth(
    latestStatus: DeploymentStatus | null,
    failedDeployments7d: number,
  ): MonitoringHealth {
    if (latestStatus === DeploymentStatus.FAILED) {
      return 'CRITICAL';
    }
    if (latestStatus === DeploymentStatus.CANCELED) {
      return 'WARNING';
    }
    if (failedDeployments7d > 0) {
      return 'WARNING';
    }
    if (latestStatus === DeploymentStatus.SUCCESS) {
      return 'HEALTHY';
    }
    return 'UNKNOWN';
  }

  private resolveBlockingReasons(server: {
    status: ServerStatus;
    isVerified: boolean;
    lastPreparedAt: Date | null;
  }): string[] {
    const reasons: string[] = [];

    if (!server.isVerified) {
      reasons.push('SSH validation required');
    }
    if (server.status === ServerStatus.UNREACHABLE) {
      reasons.push('Server unreachable');
    }
    if (server.status === ServerStatus.PREPARATION_FAILED) {
      reasons.push('Preparation failed');
    }
    if (!server.lastPreparedAt) {
      reasons.push('Preparation required');
    }

    return reasons;
  }

  private async getDerivedAlerts() {
    const servers = await this.prisma.server.findMany({
      where: {
        OR: [
          { status: ServerStatus.UNREACHABLE },
          { status: ServerStatus.PREPARATION_FAILED },
        ],
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    const failedDeployments = await this.prisma.deployment.findMany({
      where: {
        status: DeploymentStatus.FAILED,
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        projectId: true,
        project: {
          select: {
            name: true,
          },
        },
      },
    });

    const serverAlerts: AlertItem[] = servers.map((server) => ({
      id: `server-${server.id}`,
      severity: 'critical',
      status: 'firing',
      summary: `${server.name}: ${server.status === ServerStatus.UNREACHABLE ? 'server unreachable' : 'preparation failed'}`,
      source: 'platform',
      startsAt: new Date().toISOString(),
      serverId: server.id,
    }));

    const deploymentAlerts: AlertItem[] = failedDeployments.map(
      (deployment) => ({
        id: `deployment-${deployment.id}`,
        severity: 'warning',
        status: 'firing',
        summary: `Failed deployment on project ${deployment.project.name}`,
        source: 'platform',
        startsAt: deployment.createdAt.toISOString(),
        projectId: deployment.projectId,
      }),
    );

    const items = [...serverAlerts, ...deploymentAlerts];

    return {
      source: 'derived',
      total: items.length,
      warning: items.filter((item) => item.severity === 'warning').length,
      critical: items.filter((item) => item.severity === 'critical').length,
      info: items.filter((item) => item.severity === 'info').length,
      items,
    };
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

  private daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
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

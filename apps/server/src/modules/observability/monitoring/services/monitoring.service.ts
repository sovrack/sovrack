import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ServerRunStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PlatformService } from '../../../platform/platform.service';
import {
  AutomationService,
  CreateAutomationRunDto,
  AUTOMATION_ACTIONS,
} from '../../../automation';
import {
  AUTOMATION_RUN_COMPLETED,
  type AutomationRunCompletedEvent,
} from '../../../../shared/events/events.catalog';
import { InstallMonitoringDto } from '../dto/install-monitoring.dto';
import { MonitoringStatsService } from './monitoring-stats.service';
import { MonitoringPrometheusService } from './monitoring-prometheus.service';
import { MonitoringAlertsService } from './monitoring-alerts.service';

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
    private readonly alertsService: MonitoringAlertsService,
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

  /**
   * Historical CPU/mem/disk time-series for a host over a window (default 1h).
   * Powers the UI charts (vs the live snapshot in getServerMonitoring).
   */
  async getServerMetricRange(
    host: string,
    rangeMinutes = 60,
    stepSeconds = 60,
  ) {
    const safeRange = Math.min(Math.max(rangeMinutes, 5), 7 * 24 * 60);
    const safeStep = Math.min(Math.max(stepSeconds, 15), 3600);
    const to = new Date();
    const from = new Date(to.getTime() - safeRange * 60 * 1000);
    return await this.prometheusService.getHostMetricRange({
      host,
      from,
      to,
      stepSeconds: safeStep,
    });
  }

  /**
   * B4/B5 : liens monitoring (Grafana/Prometheus/Loki) pour un
   * service-environnement. Résolution PAR SERVEUR : le serveur cible du
   * service-env (serverId explicite, sinon 1er serveur de l'environnement) ;
   * si la stack y est installée (`monitoringInstalledAt`), les URLs se
   * déduisent de son host. Fallback : URLs globales de la config plateforme
   * (compat mono-serveur / Grafana externe).
   */
  async getMonitoringLinksForServiceEnv(serviceEnvId: string): Promise<{
    installed: boolean;
    source: 'server' | 'platform' | null;
    serverHost: string | null;
    grafanaUrl: string | null;
    prometheusUrl: string | null;
    lokiUrl: string | null;
  }> {
    const serviceEnv = await this.prisma.serviceEnvironment.findUnique({
      where: { id: serviceEnvId },
      select: {
        environmentId: true,
        server: {
          select: { host: true, monitoringInstalledAt: true },
        },
      },
    });
    if (!serviceEnv) {
      throw new BadRequestException('Service-environnement introuvable');
    }

    const server =
      serviceEnv.server ??
      (await this.prisma.server.findFirst({
        where: { environmentId: serviceEnv.environmentId, archivedAt: null },
        select: { host: true, monitoringInstalledAt: true },
      }));

    if (server?.monitoringInstalledAt) {
      return {
        installed: true,
        source: 'server',
        serverHost: server.host,
        grafanaUrl: `http://${server.host}:3000`,
        prometheusUrl: `http://${server.host}:9090`,
        lokiUrl: `http://${server.host}:3100`,
      };
    }

    const [grafanaUrl, prometheusUrl, lokiUrl] = await Promise.all([
      this.getConfigValue('MONITORING_GRAFANA_URL'),
      this.getConfigValue('MONITORING_PROMETHEUS_URL'),
      this.getConfigValue('MONITORING_LOKI_URL'),
    ]);

    return {
      installed: Boolean(grafanaUrl),
      source: grafanaUrl ? 'platform' : null,
      serverHost: server?.host ?? null,
      grafanaUrl: grafanaUrl ? this.trimTrailingSlash(grafanaUrl) : null,
      prometheusUrl: prometheusUrl
        ? this.trimTrailingSlash(prometheusUrl)
        : null,
      lokiUrl: lokiUrl ? this.trimTrailingSlash(lokiUrl) : null,
    };
  }

  /** Historical CPU/memory time-series for one service-environment (containers). */
  async getServiceMetricRange(
    serviceEnvId: string,
    rangeMinutes = 60,
    stepSeconds = 60,
  ) {
    const safeRange = Math.min(Math.max(rangeMinutes, 5), 7 * 24 * 60);
    const safeStep = Math.min(Math.max(stepSeconds, 15), 3600);
    const to = new Date();
    const from = new Date(to.getTime() - safeRange * 60 * 1000);
    return await this.prometheusService.getServiceMetricRange({
      serviceEnvId,
      from,
      to,
      stepSeconds: safeStep,
    });
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

    return await this.alertsService.getDerivedAlerts();
  }

  async getInstallOptions() {
    return await this.alertsService.getInstallOptions();
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
   * Une fois la stack monitoring installée avec succès sur un serveur :
   *  1. (B4) on tamponne `Server.monitoringInstalledAt` sur CHAQUE serveur
   *     réussi — le monitoring est scopé PAR SERVEUR, les URLs
   *     Grafana/Prometheus/Loki se déduisent de son `host` ;
   *  2. compat : on câble aussi les URLs globales en config plateforme si
   *     absentes (ne surcharge jamais une URL déjà posée par l'admin, ex.
   *     Grafana externe) — utilisées comme fallback quand aucun serveur
   *     précis n'est ciblé.
   */
  @OnEvent(AUTOMATION_RUN_COMPLETED)
  async onAutomationRunCompleted(
    event: AutomationRunCompletedEvent,
  ): Promise<void> {
    const action = AUTOMATION_ACTIONS.find((a) => a.key === event.actionKey);
    if (!action || action.category !== 'monitoring') return;
    const installsStack = (action.roles ?? []).some((r) =>
      ['prometheus', 'grafana', 'loki'].includes(r),
    );
    if (!installsStack) return;
    if (
      event.status !== ServerRunStatus.SUCCEEDED &&
      event.status !== ServerRunStatus.PARTIAL
    ) {
      return;
    }
    const hosts = event.succeededHosts.filter(Boolean);
    if (hosts.length === 0) return;

    await this.prisma.server.updateMany({
      where: { host: { in: hosts } },
      data: { monitoringInstalledAt: new Date() },
    });

    const host = hosts[0];
    const setIfAbsent = async (key: string, value: string) => {
      const current = await this.platformConfig.get(key);
      if (!current || current.trim().length === 0) {
        await this.platformConfig.set(key, value);
      }
    };
    await setIfAbsent('MONITORING_PROMETHEUS_URL', `http://${host}:9090`);
    await setIfAbsent('MONITORING_GRAFANA_URL', `http://${host}:3000`);
    await setIfAbsent('MONITORING_LOKI_URL', `http://${host}:3100`);
    this.logger.log(
      `Monitoring stack installed on ${hosts.join(', ')} → monitoringInstalledAt posé (+ URLs plateforme si absentes).`,
    );
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

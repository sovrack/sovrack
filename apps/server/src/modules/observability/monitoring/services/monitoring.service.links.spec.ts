import { BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ServerRunStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PlatformService } from '../../../platform/platform.service';
import { AutomationService } from '../../../automation/services/automation.service';
import { MonitoringStatsService } from './monitoring-stats.service';
import { MonitoringPrometheusService } from './monitoring-prometheus.service';
import { MonitoringService } from './monitoring.service';
import type { AutomationRunCompletedEvent } from '../../../../shared/events/events.catalog';

/**
 * B4/B5 (plan produit final) : le monitoring est scopé PAR SERVEUR.
 *  - getMonitoringLinksForServiceEnv résout le serveur du service-env et
 *    déduit les URLs de son host quand monitoringInstalledAt est posé ;
 *    sinon fallback config plateforme.
 *  - onAutomationRunCompleted tamponne monitoringInstalledAt sur CHAQUE
 *    serveur réussi d'un run monitoring.
 */
function makeService(overrides: {
  serviceEnv?: unknown;
  fallbackServer?: unknown;
  platformValues?: Record<string, string | null>;
}) {
  const prisma = {
    serviceEnvironment: {
      findUnique: jest.fn().mockResolvedValue(overrides.serviceEnv ?? null),
    },
    server: {
      findFirst: jest.fn().mockResolvedValue(overrides.fallbackServer ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    platformConfig: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const value = overrides.platformValues?.[where.key as string] ?? null;
        return Promise.resolve(
          value === null ? null : { key: where.key, value, isSecret: false },
        );
      }),
    },
  };
  const platform = {
    get: jest
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(overrides.platformValues?.[key] ?? null),
      ),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const service = new MonitoringService(
    prisma as unknown as PrismaService,
    {} as unknown as HttpService,
    platform as unknown as PlatformService,
    {} as unknown as AutomationService,
    {} as unknown as MonitoringStatsService,
    {} as unknown as MonitoringPrometheusService,
    {} as never,
  );
  return { service, prisma, platform };
}

describe('MonitoringService.getMonitoringLinksForServiceEnv', () => {
  it('throws when the service-environment does not exist', async () => {
    const { service } = makeService({ serviceEnv: null });
    await expect(
      service.getMonitoringLinksForServiceEnv('ghost'),
    ).rejects.toThrow(BadRequestException);
  });

  it('derives URLs from the target server host when the stack is installed', async () => {
    const { service } = makeService({
      serviceEnv: {
        environmentId: 'env1',
        server: { host: '10.1.2.3', monitoringInstalledAt: new Date() },
      },
    });
    const links = await service.getMonitoringLinksForServiceEnv('se1');
    expect(links).toMatchObject({
      installed: true,
      source: 'server',
      serverHost: '10.1.2.3',
      grafanaUrl: 'http://10.1.2.3:3000',
      prometheusUrl: 'http://10.1.2.3:9090',
      lokiUrl: 'http://10.1.2.3:3100',
    });
  });

  it('falls back to the first environment server when serverId is not set', async () => {
    const { service, prisma } = makeService({
      serviceEnv: { environmentId: 'env1', server: null },
      fallbackServer: { host: '10.9.9.9', monitoringInstalledAt: new Date() },
    });
    const links = await service.getMonitoringLinksForServiceEnv('se1');
    expect(prisma.server.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { environmentId: 'env1', archivedAt: null },
      }),
    );
    expect(links.installed).toBe(true);
    expect(links.grafanaUrl).toBe('http://10.9.9.9:3000');
  });

  it('falls back to platform config when the server has no monitoring stack', async () => {
    const { service } = makeService({
      serviceEnv: {
        environmentId: 'env1',
        server: { host: '10.0.0.1', monitoringInstalledAt: null },
      },
      platformValues: {
        MONITORING_GRAFANA_URL: 'http://grafana.example.com/',
        MONITORING_PROMETHEUS_URL: null,
        MONITORING_LOKI_URL: null,
      },
    });
    const links = await service.getMonitoringLinksForServiceEnv('se1');
    expect(links).toMatchObject({
      installed: true,
      source: 'platform',
      serverHost: '10.0.0.1',
      grafanaUrl: 'http://grafana.example.com',
      prometheusUrl: null,
    });
  });

  it('reports not installed when neither server stack nor platform URL exist', async () => {
    const { service } = makeService({
      serviceEnv: {
        environmentId: 'env1',
        server: { host: '10.0.0.1', monitoringInstalledAt: null },
      },
      platformValues: {},
    });
    const links = await service.getMonitoringLinksForServiceEnv('se1');
    expect(links.installed).toBe(false);
    expect(links.source).toBeNull();
    expect(links.grafanaUrl).toBeNull();
  });
});

describe('MonitoringService.onAutomationRunCompleted (B4)', () => {
  const baseEvent: AutomationRunCompletedEvent = {
    runId: 'run1',
    actionKey: 'install_prometheus_grafana',
    status: ServerRunStatus.SUCCEEDED,
    succeededHosts: ['10.1.1.1', '10.2.2.2'],
    failedHosts: [],
  } as unknown as AutomationRunCompletedEvent;

  it('stamps monitoringInstalledAt on every succeeded server', async () => {
    const { service, prisma } = makeService({ platformValues: {} });
    await service.onAutomationRunCompleted(baseEvent);
    expect(prisma.server.updateMany).toHaveBeenCalledWith({
      where: { host: { in: ['10.1.1.1', '10.2.2.2'] } },
      data: { monitoringInstalledAt: expect.any(Date) },
    });
  });

  it('ignores non-monitoring actions and failed runs', async () => {
    const { service, prisma } = makeService({ platformValues: {} });
    await service.onAutomationRunCompleted({
      ...baseEvent,
      actionKey: 'install_loki', // monitoring, mais status FAILED ci-dessous
      status: ServerRunStatus.FAILED,
    });
    await service.onAutomationRunCompleted({
      ...baseEvent,
      actionKey: 'unknown_action',
    });
    expect(prisma.server.updateMany).not.toHaveBeenCalled();
  });
});

import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PlatformService } from '../../../platform/platform.service';
import { AutomationService } from '../../../automation/services/automation.service';
import { MonitoringStatsService } from './monitoring-stats.service';
import { MonitoringPrometheusService } from './monitoring-prometheus.service';
import { MonitoringService } from './monitoring.service';

/**
 * getOverview aggregates per-server monitoring health into totals + folds in the
 * Prometheus/Grafana status. We stub the three data sources and assert the
 * status reduction.
 */
describe('MonitoringService.getOverview', () => {
  let service: MonitoringService;

  beforeEach(() => {
    service = new MonitoringService(
      {} as unknown as PrismaService,
      {} as unknown as HttpService,
      {} as unknown as PlatformService,
      {} as unknown as AutomationService,
      {} as unknown as MonitoringStatsService,
      {} as unknown as MonitoringPrometheusService,
      {} as never, // MonitoringAlertsService (alerts/install extracted)
    );
  });

  it('counts servers by monitoring status and includes prom/grafana status', async () => {
    jest
      .spyOn(service, 'getServerMonitoring')
      .mockResolvedValue([
        { monitoringStatus: 'HEALTHY' },
        { monitoringStatus: 'HEALTHY' },
        { monitoringStatus: 'WARNING' },
        { monitoringStatus: 'CRITICAL' },
        { monitoringStatus: 'UNKNOWN' },
      ] as never);
    jest
      .spyOn(service, 'getPrometheusStatus')
      .mockResolvedValue({ configured: true, reachable: true } as never);
    jest
      .spyOn(service, 'getGrafanaStatus')
      .mockResolvedValue({ configured: false, reachable: false } as never);

    const overview = await service.getOverview();

    expect(overview.totalMonitoredServers).toBe(5);
    expect(overview.healthy).toBe(2);
    expect(overview.warning).toBe(1);
    expect(overview.critical).toBe(1);
    expect(overview.unknown).toBe(1);
    expect(overview.prometheus).toMatchObject({ reachable: true });
    expect(overview.grafana).toMatchObject({ configured: false });
    expect(overview.generatedAt).toBeDefined();
  });

  it('returns all-zero counts when no servers are monitored', async () => {
    jest.spyOn(service, 'getServerMonitoring').mockResolvedValue([] as never);
    jest
      .spyOn(service, 'getPrometheusStatus')
      .mockResolvedValue({ configured: false } as never);
    jest
      .spyOn(service, 'getGrafanaStatus')
      .mockResolvedValue({ configured: false } as never);

    const overview = await service.getOverview();
    expect(overview.totalMonitoredServers).toBe(0);
    expect(overview.healthy).toBe(0);
  });
});

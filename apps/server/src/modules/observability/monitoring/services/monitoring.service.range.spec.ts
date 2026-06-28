import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PlatformService } from '../../../platform/platform.service';
import { AutomationService } from '../../../automation/services/automation.service';
import { MonitoringStatsService } from './monitoring-stats.service';
import { MonitoringPrometheusService } from './monitoring-prometheus.service';
import { MonitoringService } from './monitoring.service';

/**
 * Focused coverage for getServerMetricRange's clamping: untrusted query params
 * (minutes/step) must be bounded before they hit Prometheus query_range.
 */
describe('MonitoringService.getServerMetricRange', () => {
  let prometheus: { getHostMetricRange: jest.Mock };
  let service: MonitoringService;

  beforeEach(() => {
    prometheus = { getHostMetricRange: jest.fn().mockResolvedValue({}) };
    service = new MonitoringService(
      {} as unknown as PrismaService,
      {} as unknown as HttpService,
      {} as unknown as PlatformService,
      {} as unknown as AutomationService,
      {} as unknown as MonitoringStatsService,
      prometheus as unknown as MonitoringPrometheusService,
      {} as never, // MonitoringAlertsService (alerts/install extracted)
    );
  });

  it('passes through sane values and a matching from/to window', async () => {
    await service.getServerMetricRange('10.0.0.1', 60, 60);
    const arg = prometheus.getHostMetricRange.mock.calls[0][0];
    expect(arg.host).toBe('10.0.0.1');
    expect(arg.stepSeconds).toBe(60);
    const windowMin = (arg.to.getTime() - arg.from.getTime()) / 60_000;
    expect(Math.round(windowMin)).toBe(60);
  });

  it('clamps the range to [5min, 7d] and the step to [15s, 3600s]', async () => {
    await service.getServerMetricRange('h', 1, 1); // below floors
    let arg = prometheus.getHostMetricRange.mock.calls[0][0];
    expect(arg.stepSeconds).toBe(15);
    expect(Math.round((arg.to.getTime() - arg.from.getTime()) / 60_000)).toBe(
      5,
    );

    await service.getServerMetricRange('h', 999_999, 999_999); // above ceilings
    arg = prometheus.getHostMetricRange.mock.calls[1][0];
    expect(arg.stepSeconds).toBe(3600);
    expect(Math.round((arg.to.getTime() - arg.from.getTime()) / 60_000)).toBe(
      7 * 24 * 60,
    );
  });
});

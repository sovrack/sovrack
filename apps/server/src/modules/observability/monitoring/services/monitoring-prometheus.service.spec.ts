import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { PlatformService } from '../../../platform/platform.service';
import { MonitoringPrometheusService } from './monitoring-prometheus.service';

describe('MonitoringPrometheusService', () => {
  let http: { get: jest.Mock };
  let platform: { get: jest.Mock };
  let service: MonitoringPrometheusService;

  const range = {
    host: '10.0.0.1',
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-01-01T01:00:00Z'),
    stepSeconds: 60,
  };

  beforeEach(() => {
    http = { get: jest.fn() };
    platform = { get: jest.fn().mockResolvedValue(null) };
    service = new MonitoringPrometheusService(
      http as unknown as HttpService,
      platform as unknown as PlatformService,
    );
  });

  describe('getHostMetricRange', () => {
    it('returns configured:false when Prometheus is not configured', async () => {
      platform.get.mockResolvedValue(null);
      const res = await service.getHostMetricRange(range);
      expect(res.configured).toBe(false);
      expect(res.series.cpuPercent).toEqual([]);
    });

    it('queries query_range and parses matrix values per series', async () => {
      platform.get.mockResolvedValue('http://prom:9090/');
      http.get.mockReturnValue(
        of({ data: { data: { result: [{ values: [[1735689600, '50']] }] } } }),
      );
      const res = await service.getHostMetricRange(range);
      expect(res.configured).toBe(true);
      expect(res.series.cpuPercent).toEqual([{ t: 1735689600, value: 50 }]);
      expect(res.series.memoryPercent).toEqual([{ t: 1735689600, value: 50 }]);
      // 3 series (cpu/mem/disk) → 3 query_range calls
      expect(http.get).toHaveBeenCalledTimes(3);
    });

    it('degrades to empty series when a query fails', async () => {
      platform.get.mockResolvedValue('http://prom:9090');
      http.get.mockReturnValue(throwError(() => new Error('prom down')));
      const res = await service.getHostMetricRange(range);
      expect(res.configured).toBe(true);
      expect(res.series.cpuPercent).toEqual([]);
    });
  });

  describe('extractHostFromInstance', () => {
    const extract = (i: string): string =>
      (
        service as unknown as { extractHostFromInstance: (i: string) => string }
      ).extractHostFromInstance(i);

    it('strips the port from an IPv4 instance', () => {
      expect(extract('10.0.0.1:9100')).toBe('10.0.0.1');
    });
    it('handles a bracketed IPv6 instance', () => {
      expect(extract('[::1]:9100')).toBe('::1');
    });
    it('lowercases a hostname', () => {
      expect(extract('Server-01:9100')).toBe('server-01');
    });
  });

  it('trimTrailingSlash removes trailing slashes', () => {
    const trim = (v: string): string =>
      (
        service as unknown as { trimTrailingSlash: (v: string) => string }
      ).trimTrailingSlash(v);
    expect(trim('http://x:9090///')).toBe('http://x:9090');
  });
});

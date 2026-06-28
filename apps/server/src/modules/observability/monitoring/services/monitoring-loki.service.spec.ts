import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { PlatformService } from '../../../platform/platform.service';
import { MonitoringLokiService } from './monitoring-loki.service';

function makeService(opts: {
  lokiUrl?: string | null;
  httpResponse?: unknown;
  httpThrows?: boolean;
}) {
  const platform = {
    get: jest.fn().mockResolvedValue(opts.lokiUrl ?? null),
  } as unknown as PlatformService;

  const get = jest.fn(() =>
    opts.httpThrows
      ? throwError(() => new Error('connection refused'))
      : of({ data: opts.httpResponse ?? { data: { result: [] } } }),
  );
  const http = { get } as unknown as HttpService;

  return { service: new MonitoringLokiService(http, platform), get };
}

describe('MonitoringLokiService.buildLogQL', () => {
  const { service } = makeService({});

  it('builds a stream selector on the service-env label', () => {
    expect(service.buildLogQL('env-1')).toBe('{platform_service_env="env-1"}');
  });

  it('adds a case-insensitive line filter when a search term is given', () => {
    expect(service.buildLogQL('env-1', 'Error')).toBe(
      '{platform_service_env="env-1"} |~ "(?i)Error"',
    );
  });

  it('escapes quotes/backslashes in the label value (no injection)', () => {
    expect(service.buildLogQL('a"b\\c')).toBe(
      '{platform_service_env="a\\"b\\\\c"}',
    );
  });

  it('escapes regex metacharacters in the search term', () => {
    expect(service.buildLogQL('env-1', 'a.b*c')).toBe(
      '{platform_service_env="env-1"} |~ "(?i)a\\.b\\*c"',
    );
  });

  it('ignores a blank search term', () => {
    expect(service.buildLogQL('env-1', '   ')).toBe(
      '{platform_service_env="env-1"}',
    );
  });
});

describe('MonitoringLokiService.queryServiceLogs', () => {
  it('returns configured=false when MONITORING_LOKI_URL is unset (graceful)', async () => {
    const { service, get } = makeService({ lokiUrl: null });
    const res = await service.queryServiceLogs('env-1');
    expect(res.configured).toBe(false);
    expect(res.reachable).toBe(false);
    expect(res.entries).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('parses Loki streams into entries sorted newest-first (ns → ms)', async () => {
    const { service } = makeService({
      lokiUrl: 'http://loki:3100',
      httpResponse: {
        data: {
          result: [
            {
              stream: { platform_service_env: 'env-1' },
              values: [
                ['2000000000', 'older line'], // 2000ms
                ['5000000000', 'newer line'], // 5000ms
              ],
            },
          ],
        },
      },
    });

    const res = await service.queryServiceLogs('env-1');

    expect(res.configured).toBe(true);
    expect(res.reachable).toBe(true);
    expect(res.total).toBe(2);
    expect(res.entries[0]).toMatchObject({ ts: 5000, line: 'newer line' });
    expect(res.entries[1]).toMatchObject({ ts: 2000, line: 'older line' });
  });

  it('reports reachable=false when Loki errors', async () => {
    const { service } = makeService({
      lokiUrl: 'http://loki:3100',
      httpThrows: true,
    });
    const res = await service.queryServiceLogs('env-1');
    expect(res.configured).toBe(true);
    expect(res.reachable).toBe(false);
    expect(res.message).toContain('injoignable');
  });
});

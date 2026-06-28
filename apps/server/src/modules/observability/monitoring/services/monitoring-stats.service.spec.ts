import { DeploymentStatus, ServerStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { MonitoringStatsService } from './monitoring-stats.service';

describe('MonitoringStatsService — pure health resolvers', () => {
  let service: MonitoringStatsService;

  const serverHealth = (
    status: ServerStatus,
    isVerified: boolean,
    metrics: {
      up: number | null;
      cpuPercent: number | null;
      memoryPercent: number | null;
      diskPercent: number | null;
    },
  ): string =>
    (
      service as unknown as {
        resolveServerHealth: (
          s: ServerStatus,
          v: boolean,
          m: unknown,
        ) => string;
      }
    ).resolveServerHealth(status, isVerified, metrics);

  const projectHealth = (
    latest: DeploymentStatus | null,
    failed7d: number,
  ): string =>
    (
      service as unknown as {
        resolveProjectHealth: (l: DeploymentStatus | null, f: number) => string;
      }
    ).resolveProjectHealth(latest, failed7d);

  const blockingReasons = (server: {
    status: ServerStatus;
    isVerified: boolean;
    lastPreparedAt: Date | null;
  }): string[] =>
    (
      service as unknown as {
        resolveBlockingReasons: (s: unknown) => string[];
      }
    ).resolveBlockingReasons(server);

  const ok = { up: 1, cpuPercent: 20, memoryPercent: 30, diskPercent: 40 };

  beforeEach(() => {
    service = new MonitoringStatsService({} as unknown as PrismaService);
  });

  describe('resolveServerHealth', () => {
    it('CRITICAL when unreachable', () => {
      expect(serverHealth(ServerStatus.UNREACHABLE, true, ok)).toBe('CRITICAL');
    });
    it('WARNING when not verified', () => {
      expect(serverHealth(ServerStatus.NEW, false, ok)).toBe('WARNING');
    });
    it('CRITICAL when no targets up', () => {
      expect(serverHealth(ServerStatus.PREPARED, true, { ...ok, up: 0 })).toBe(
        'CRITICAL',
      );
    });
    it('CRITICAL at >=95% resource usage', () => {
      expect(
        serverHealth(ServerStatus.PREPARED, true, { ...ok, cpuPercent: 96 }),
      ).toBe('CRITICAL');
    });
    it('WARNING at >=85% resource usage', () => {
      expect(
        serverHealth(ServerStatus.PREPARED, true, { ...ok, memoryPercent: 88 }),
      ).toBe('WARNING');
    });
    it('HEALTHY when verified, up, and within limits', () => {
      expect(serverHealth(ServerStatus.PREPARED, true, ok)).toBe('HEALTHY');
    });
  });

  describe('resolveProjectHealth', () => {
    it('CRITICAL on latest FAILED', () => {
      expect(projectHealth(DeploymentStatus.FAILED, 0)).toBe('CRITICAL');
    });
    it('WARNING on latest CANCELED', () => {
      expect(projectHealth(DeploymentStatus.CANCELED, 0)).toBe('WARNING');
    });
    it('WARNING when there were failures in 7d', () => {
      expect(projectHealth(DeploymentStatus.SUCCESS, 2)).toBe('WARNING');
    });
    it('HEALTHY on latest SUCCESS with no recent failures', () => {
      expect(projectHealth(DeploymentStatus.SUCCESS, 0)).toBe('HEALTHY');
    });
    it('UNKNOWN with no history', () => {
      expect(projectHealth(null, 0)).toBe('UNKNOWN');
    });
  });

  describe('resolveBlockingReasons', () => {
    it('reports SSH + preparation when unverified and never prepared', () => {
      const reasons = blockingReasons({
        status: ServerStatus.NEW,
        isVerified: false,
        lastPreparedAt: null,
      });
      expect(reasons).toContain('SSH validation required');
      expect(reasons).toContain('Preparation required');
    });
    it('is empty for a verified, prepared, reachable server', () => {
      const reasons = blockingReasons({
        status: ServerStatus.PREPARED,
        isVerified: true,
        lastPreparedAt: new Date(),
      });
      expect(reasons).toEqual([]);
    });
  });
});

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { DockerApiService } from '../../../../adapters/container-runtime/docker-api.service';
import { MonitoringLokiService } from './monitoring-loki.service';
import { MonitoringServerResolverService } from './monitoring-server-resolver.service';
import { WorkspaceAccessService } from '../../../iam/authorization/workspace-access.service';
import {
  MonitoringRuntimeLogsService,
  type RuntimeLogLine,
} from './monitoring-runtime-logs.service';

function makeDocker(lines: RuntimeLogLine[]) {
  return {
    streamContainerLogs: jest.fn(async function* () {
      for (const l of lines) yield l;
    }),
  };
}

describe('MonitoringRuntimeLogsService', () => {
  const lines: RuntimeLogLine[] = [
    { stream: 'stdout', line: 'server started on port 3000' },
    { stream: 'stderr', line: 'WARN deprecated config' },
    { stream: 'stdout', line: 'GET /health 200' },
    { stream: 'stderr', line: 'ERROR connection refused' },
  ];

  function make(member: { role: string } | null) {
    const prisma = {
      serviceEnvironment: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ service: { projectId: 'p1' } }),
      },
      container: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ serverId: 'srv-1', name: 'app-env-1' }),
      },
    };
    const docker = makeDocker(lines);
    const loki = {
      queryServiceLogs: jest.fn().mockResolvedValue({
        configured: false,
        reachable: false,
        serviceEnvId: 'env-1',
        from: 0,
        to: 0,
        total: 0,
        entries: [],
      }),
    };
    const service = new MonitoringRuntimeLogsService(
      prisma as unknown as PrismaService,
      docker as unknown as DockerApiService,
      loki as unknown as MonitoringLokiService,
      {} as unknown as MonitoringServerResolverService,
      {
        assertProjectAction: member
          ? jest.fn().mockResolvedValue(undefined)
          : jest.fn().mockRejectedValue(new ForbiddenException()),
      } as unknown as WorkspaceAccessService,
    );
    return { service, prisma, docker, loki };
  }

  it('denies a non-member developer', async () => {
    const { service } = make(null);
    await expect(
      service.searchServiceLogs('env-1', 'u2', Role.MEMBER, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns all lines for a project member (no filter)', async () => {
    const { service } = make({ role: 'OWNER' });
    const res = await service.searchServiceLogs('env-1', 'u1', Role.MEMBER, {});
    expect(res.total).toBe(4);
    expect(res.matched).toBe(4);
    expect(res.container).toBe('app-env-1');
  });

  it('filters by text search (case-insensitive)', async () => {
    const { service } = make({ role: 'OWNER' });
    const res = await service.searchServiceLogs('env-1', 'u1', Role.MEMBER, {
      search: 'error',
    });
    expect(res.matched).toBe(1);
    expect(res.lines[0].line).toContain('ERROR');
  });

  it('filters by stream (stderr only)', async () => {
    const { service } = make({ role: 'OWNER' });
    const res = await service.searchServiceLogs('env-1', 'u1', Role.MEMBER, {
      stream: 'stderr',
    });
    expect(res.matched).toBe(2);
    expect(res.lines.every((l) => l.stream === 'stderr')).toBe(true);
  });

  it('throws when no running container exists', async () => {
    const { service, prisma } = make({ role: 'OWNER' });
    prisma.container.findFirst.mockResolvedValue(null);
    await expect(
      service.searchServiceLogs('env-1', 'u1', Role.MEMBER, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

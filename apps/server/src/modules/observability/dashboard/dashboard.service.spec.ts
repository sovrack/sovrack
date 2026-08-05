import { Role, ServerStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DashboardService } from './dashboard.service';

const now = Date.now();
const ago = (days: number) => new Date(now - days * 86400_000);

describe('DashboardService.getStats', () => {
  let prisma: {
    project: { count: jest.Mock };
    environment: { count: jest.Mock };
    server: { count: jest.Mock; findMany: jest.Mock };
    deployment: { findMany: jest.Mock; count: jest.Mock };
    projectMember: { findMany: jest.Mock };
  };
  let service: DashboardService;

  const deployments = [
    {
      id: 'd1',
      status: 'SUCCESS',
      createdAt: ago(1),
      startedAt: ago(1),
      finishedAt: new Date(ago(1).getTime() + 60_000), // 60s
      projectId: 'p1',
      project: { id: 'p1', name: 'Alpha' },
      environment: { name: 'prod' },
      branch: 'main',
    },
    {
      id: 'd2',
      status: 'FAILED',
      createdAt: ago(2),
      startedAt: ago(2),
      finishedAt: new Date(ago(2).getTime() + 120_000), // 120s
      projectId: 'p1',
      project: { id: 'p1', name: 'Alpha' },
      environment: { name: 'prod' },
      branch: 'main',
    },
    {
      id: 'd3',
      status: 'SUCCESS',
      createdAt: ago(20), // within 30d, outside 7d
      startedAt: null,
      finishedAt: null,
      projectId: 'p2',
      project: { id: 'p2', name: 'Beta' },
      environment: { name: 'staging' },
      branch: 'dev',
    },
  ];

  beforeEach(() => {
    prisma = {
      project: { count: jest.fn().mockResolvedValue(3) },
      environment: { count: jest.fn().mockResolvedValue(4) },
      server: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { status: ServerStatus.PREPARED },
            { status: ServerStatus.UNREACHABLE },
          ]),
      },
      deployment: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(deployments) // 30d window
          .mockResolvedValueOnce([deployments[1]]), // recent failures
        count: jest.fn().mockResolvedValue(1), // running
      },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new DashboardService(prisma as unknown as PrismaService);
  });

  it('computes the 7d success rate over finished deployments', async () => {
    const stats = await service.getStats('admin-1', Role.OWNER);
    // 7d window: d1 SUCCESS + d2 FAILED → 1/2 = 50%
    expect(stats.kpis.successRate7d).toBe(50);
    expect(stats.kpis.deploymentsLast7d).toBe(2);
    expect(stats.kpis.deploymentsLast30d).toBe(3);
  });

  it('averages duration over deployments that have start+finish', async () => {
    const stats = await service.getStats('admin-1', Role.OWNER);
    // d1=60s, d2=120s, d3 has no times → avg = 90s
    expect(stats.kpis.avgDurationSeconds).toBe(90);
  });

  it('counts idle projects (no deploy in 7d)', async () => {
    const stats = await service.getStats('admin-1', Role.OWNER);
    // 3 projects total, only p1 active in 7d → 2 idle (p2 + 1 with no deploys)
    expect(stats.kpis.idleProjectsCount).toBe(2);
  });

  it('builds a 7-point activity series and a server status breakdown', async () => {
    const stats = await service.getStats('admin-1', Role.OWNER);
    expect(stats.activity).toHaveLength(7);
    expect(stats.servers.ready).toBe(1);
    expect(stats.servers.error).toBe(1);
    expect(stats.servers.total).toBe(2);
  });

  it('ranks top projects by deploy count with their success rate', async () => {
    const stats = await service.getStats('admin-1', Role.OWNER);
    expect(stats.topProjects[0].id).toBe('p1'); // 2 deploys
    expect(stats.topProjects[0].deployCount).toBe(2);
    expect(stats.recentFailures[0].projectName).toBe('Alpha');
  });

  it('scopes every query to the caller projects for a non-admin (no cross-project leak)', async () => {
    prisma.projectMember.findMany.mockResolvedValue([{ projectId: 'p1' }]);

    await service.getStats('dev-1', Role.MEMBER);

    // Membership resolved for the caller.
    expect(prisma.projectMember.findMany).toHaveBeenCalledWith({
      where: { userId: 'dev-1' },
      select: { projectId: true },
    });
    // Deployment queries filtered to the caller's projects.
    for (const call of prisma.deployment.findMany.mock.calls) {
      expect(call[0].where.projectId).toEqual({ in: ['p1'] });
    }
    expect(prisma.deployment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: { in: ['p1'] } }),
      }),
    );
    // Project / environment / server counts scoped too.
    expect(prisma.project.count).toHaveBeenCalledWith({
      where: { id: { in: ['p1'] } },
    });
    expect(prisma.environment.count).toHaveBeenCalledWith({
      where: { projectId: { in: ['p1'] } },
    });
    // archivedAt: null ajouté (activeWhere) : un serveur archivé ne doit plus
    // gonfler le total ni apparaître dans la répartition de santé du dashboard.
    expect(prisma.server.count).toHaveBeenCalledWith({
      where: {
        environment: { projectId: { in: ['p1'] } },
        archivedAt: null,
      },
    });
  });
});

import request from 'supertest';
import { DeploymentStatus, ServerRunKind } from '@prisma/client';
import { bootstrapE2E, E2EContext } from '../setup-e2e';
import { createTestFixtures } from '../utils/test-fixtures';

/**
 * T12 — soft-delete on Service and Server:
 *  - archived rows disappear from the list endpoints
 *  - referenced history (deployments, preparations) survives
 */
describe('Soft-delete (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.resetDb();
  });

  it('DELETE service → hidden from list, but its deployments survive', async () => {
    const f = await createTestFixtures(ctx.prisma);
    const deployment = await ctx.prisma.deployment.create({
      data: {
        projectId: f.projectId,
        environmentId: f.environmentId,
        serviceId: f.serviceId,
        serviceEnvId: f.serviceEnvId,
        branch: 'main',
        status: DeploymentStatus.SUCCESS,
      },
      select: { id: true },
    });

    const del = await request(ctx.app.getHttpServer())
      .delete(`/projects/${f.projectId}/services/${f.serviceId}`)
      .set('Cookie', ctx.authCookie(f.userId));
    expect([200, 204]).toContain(del.status);

    // Hidden from the list
    const list = await request(ctx.app.getHttpServer())
      .get(`/projects/${f.projectId}/services`)
      .set('Cookie', ctx.authCookie(f.userId));
    expect(list.status).toBe(200);
    expect(
      (list.body as Array<{ id: string }>).find((s) => s.id === f.serviceId),
    ).toBeUndefined();

    // Still archived (not hard-deleted) and deployment history intact
    const archived = await ctx.prisma.service.findUnique({
      where: { id: f.serviceId },
    });
    expect(archived?.archivedAt).not.toBeNull();
    const survivingDeployment = await ctx.prisma.deployment.findUnique({
      where: { id: deployment.id },
    });
    expect(survivingDeployment).not.toBeNull();
    expect(survivingDeployment?.serviceId).toBe(f.serviceId);
  });

  it('DELETE server → hidden from list, run history survives, containers archived', async () => {
    const f = await createTestFixtures(ctx.prisma);
    // ServerPreparation/Operation were consolidated into the unified ServerRun.
    const prep = await ctx.prisma.serverRun.create({
      data: {
        serverId: f.serverId,
        teamId: f.teamId,
        kind: ServerRunKind.PREPARATION,
      },
      select: { id: true },
    });
    const container = await ctx.prisma.container.create({
      data: {
        dockerId: 'c-1',
        name: 'app',
        imageRef: 'img:1',
        status: 'RUNNING',
        serverId: f.serverId,
      },
      select: { id: true },
    });

    // Attach a SECOND server to the same environment first: the anti-orphaning
    // guard blocks deleting the LAST server of an environment (it would make the
    // env undeployable). With a backup server present, the delete is allowed.
    await ctx.prisma.server.create({
      data: {
        name: `e2e-backup-${f.serverId.slice(0, 8)}`,
        host: '10.0.0.2',
        port: 22,
        username: 'root',
        sshKey: 'e2e-ssh-private-key',
        isVerified: true,
        teamId: f.teamId,
        environmentId: f.environmentId,
      },
    });

    const del = await request(ctx.app.getHttpServer())
      .delete(`/servers/${f.serverId}`)
      .set('Cookie', ctx.authCookie(f.userId));
    expect([200, 204]).toContain(del.status);

    const list = await request(ctx.app.getHttpServer())
      .get('/servers')
      .set('Cookie', ctx.authCookie(f.userId));
    expect(list.status).toBe(200);
    const servers = Array.isArray(list.body) ? list.body : list.body.data;
    expect(
      (servers as Array<{ id: string }>).find((s) => s.id === f.serverId),
    ).toBeUndefined();

    const archived = await ctx.prisma.server.findUnique({
      where: { id: f.serverId },
    });
    expect(archived?.archivedAt).not.toBeNull();
    const survivingPrep = await ctx.prisma.serverRun.findUnique({
      where: { id: prep.id },
    });
    expect(survivingPrep).not.toBeNull();
    const archivedContainer = await ctx.prisma.container.findUnique({
      where: { id: container.id },
    });
    expect(archivedContainer?.status).toBe('EXITED');
  });
});

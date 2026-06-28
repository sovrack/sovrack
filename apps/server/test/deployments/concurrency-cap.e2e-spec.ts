import { randomUUID } from 'crypto';
import request from 'supertest';
import { DeploymentStatus, ServiceType, SourceType } from '@prisma/client';
import {
  bootstrapE2E,
  E2EContext,
  waitForDeploymentStatus,
} from '../setup-e2e';
import { createTestFixtures } from '../utils/test-fixtures';

/**
 * M1 — multi-tenant fair-share: a project's `maxConcurrentDeploys` caps the
 * number of simultaneous in-flight deployments across ALL its services, so one
 * tenant can't saturate the shared deploy workers. We use a SECOND service/env
 * link to bypass the per-serviceEnv "one active deploy" guard and isolate the
 * project-wide cap.
 */
describe('Deploy concurrency cap (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    ctx.docker.reset();
    await ctx.resetDb();
  });

  async function secondServiceEnv(f: {
    projectId: string;
    environmentId: string;
    serviceId: string;
  }): Promise<string> {
    const svc1 = await ctx.prisma.service.findUnique({
      where: { id: f.serviceId },
      select: { providerId: true },
    });
    const svc2Id = randomUUID();
    await ctx.prisma.service.create({
      data: {
        id: svc2Id,
        projectId: f.projectId,
        name: `e2e-service2-${svc2Id.slice(0, 8)}`,
        type: ServiceType.APPLICATION,
        sourceType: SourceType.GIT,
        repoPath: 'platform/e2e',
        branch: 'main',
        providerId: svc1?.providerId ?? undefined,
      },
    });
    const se2Id = randomUUID();
    await ctx.prisma.serviceEnvironment.create({
      data: { id: se2Id, serviceId: svc2Id, environmentId: f.environmentId },
    });
    return se2Id;
  }

  it('rejects a deploy that would exceed the project cap', async () => {
    const f = await createTestFixtures(ctx.prisma);
    await ctx.prisma.project.update({
      where: { id: f.projectId },
      data: { maxConcurrentDeploys: 1 },
    });

    // One in-flight deploy already running on the first service.
    await ctx.prisma.deployment.create({
      data: {
        projectId: f.projectId,
        environmentId: f.environmentId,
        serviceId: f.serviceId,
        serviceEnvId: f.serviceEnvId,
        userId: f.userId,
        branch: 'main',
        status: DeploymentStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    const se2 = await secondServiceEnv(f);
    const res = await request(ctx.app.getHttpServer())
      .post('/deployments')
      .set('Cookie', ctx.authCookie(f.userId))
      .send({
        serviceEnvId: se2,
        branch: 'main',
        buildSource: 'DOCKERFILE_LOCAL',
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('simultanés');
  });

  it('allows the deploy when the project cap has headroom', async () => {
    const f = await createTestFixtures(ctx.prisma);
    await ctx.prisma.project.update({
      where: { id: f.projectId },
      data: { maxConcurrentDeploys: 5 },
    });

    const res = await request(ctx.app.getHttpServer())
      .post('/deployments')
      .set('Cookie', ctx.authCookie(f.userId))
      .send({
        serviceEnvId: f.serviceEnvId,
        branch: 'main',
        buildSource: 'DOCKERFILE_LOCAL',
      });

    expect([200, 201]).toContain(res.status);
    // Let the fire-and-forget executor finish so it doesn't query a torn-down DB.
    await waitForDeploymentStatus(ctx.prisma, res.body.id as string);
  });
});

import request from 'supertest';
import { DeploymentStatus } from '@prisma/client';
import { bootstrapE2E, E2EContext } from '../setup-e2e';
import { createTestFixtures } from '../utils/test-fixtures';

/**
 * Rollback remains implemented and unit-tested internally, but it is a planned
 * capability in the public V1 contract. The HTTP surface must therefore stay
 * unavailable and must not create or enqueue any deployment.
 */
describe('Rollback (e2e)', () => {
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

  it('keeps the planned rollback capability outside the V1 API surface', async () => {
    const f = await createTestFixtures(ctx.prisma);

    const newDeployment = await ctx.prisma.deployment.create({
      data: {
        projectId: f.projectId,
        environmentId: f.environmentId,
        serviceId: f.serviceId,
        serviceEnvId: f.serviceEnvId,
        userId: f.userId,
        branch: 'main',
        status: DeploymentStatus.SUCCESS,
        dockerImage: 'deployautomation/e2e:new',
        imageSha:
          'sha256:new0000000000000000000000000000000000000000000000000000000000000',
        createdAt: new Date(),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      select: { id: true },
    });
    const deploymentsBefore = await ctx.prisma.deployment.count();

    const res = await request(ctx.app.getHttpServer())
      .post(`/deployments/${newDeployment.id}/rollback`)
      .set('Cookie', ctx.authCookie(f.userId));

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: 'PRODUCT_CAPABILITY_UNAVAILABLE',
    });
    await expect(ctx.prisma.deployment.count()).resolves.toBe(
      deploymentsBefore,
    );
    expect(ctx.docker.pullImage).not.toHaveBeenCalled();
  });
});

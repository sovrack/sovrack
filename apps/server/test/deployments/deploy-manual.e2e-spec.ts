import request from 'supertest';
import { bootstrapE2E, E2EContext, waitForDeploymentStatus } from '../setup-e2e';
import { createTestFixtures } from '../utils/test-fixtures';

/**
 * Test 1 — full manual deployment through the REAL DockerDeployExecutorService
 * with a fake Docker daemon.
 *
 * NOTE: the create→deploy path calls the executor DIRECTLY (fire-and-forget),
 * so there is no BullMQ job to assert (the queue is currently bypassed). We
 * therefore poll the Deployment row for the asynchronous result.
 */
describe('Deploy (manual, e2e)', () => {
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

  it('POST /deployments → SUCCESS, imageSha set, Container RUNNING, Ready condition', async () => {
    const f = await createTestFixtures(ctx.prisma);

    const res = await request(ctx.app.getHttpServer())
      .post('/deployments')
      .set('Cookie', ctx.authCookie(f.userId))
      .send({ serviceEnvId: f.serviceEnvId, branch: 'main', buildSource: 'DOCKERFILE_LOCAL' });

    expect([200, 201]).toContain(res.status);
    const deploymentId: string = res.body.id;
    expect(deploymentId).toBeTruthy();

    const final = await waitForDeploymentStatus(ctx.prisma, deploymentId);
    expect(final.status).toBe('SUCCESS');
    expect(final.imageSha).toBeTruthy();

    const container = await ctx.prisma.container.findFirst({ where: { deploymentId } });
    expect(container).not.toBeNull();
    expect(container?.status).toBe('RUNNING');

    expect(JSON.stringify(final.conditions)).toContain('Ready');

    // The fake daemon was actually driven by the real executor.
    expect(ctx.docker.pullImage).toHaveBeenCalled();
    expect(ctx.docker.createContainer).toHaveBeenCalled();
    expect(ctx.docker.startContainer).toHaveBeenCalled();
  });
});

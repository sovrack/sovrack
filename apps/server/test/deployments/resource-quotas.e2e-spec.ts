import request from 'supertest';
import {
  bootstrapE2E,
  E2EContext,
  waitForDeploymentStatus,
} from '../setup-e2e';
import { createTestFixtures } from '../utils/test-fixtures';

/**
 * Multi-tenant resource quotas (T3): a service's cpuLimit / memLimitMb must be
 * translated to the Docker HostConfig fields (NanoCpus / Memory) on the created
 * container, so a tenant can't exhaust the host's CPU/RAM.
 */
describe('Deploy resource quotas → HostConfig (e2e)', () => {
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

  it('passes NanoCpus + Memory to createContainer when limits are set', async () => {
    const f = await createTestFixtures(ctx.prisma);

    // 0.5 core + 256 MB cap on the service.
    await ctx.prisma.service.update({
      where: { id: f.serviceId },
      data: { cpuLimit: 0.5, memLimitMb: 256 },
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

    const final = await waitForDeploymentStatus(ctx.prisma, res.body.id);
    expect(final.status).toBe('SUCCESS');

    // Find the main app container create call (the one carrying resource limits;
    // a pre-deploy helper container, if any, only sets AutoRemove).
    const calls = ctx.docker.createContainer.mock.calls as Array<
      [string, { HostConfig?: { NanoCpus?: number; Memory?: number } }]
    >;
    const withLimits = calls.find((c) => c[1]?.HostConfig?.NanoCpus);
    expect(withLimits).toBeDefined();
    expect(withLimits![1].HostConfig!.NanoCpus).toBe(0.5 * 1e9);
    expect(withLimits![1].HostConfig!.Memory).toBe(256 * 1024 * 1024);
  });

  it('omits NanoCpus/Memory when no limits are set (unlimited)', async () => {
    const f = await createTestFixtures(ctx.prisma);

    const res = await request(ctx.app.getHttpServer())
      .post('/deployments')
      .set('Cookie', ctx.authCookie(f.userId))
      .send({
        serviceEnvId: f.serviceEnvId,
        branch: 'main',
        buildSource: 'DOCKERFILE_LOCAL',
      });
    expect([200, 201]).toContain(res.status);
    await waitForDeploymentStatus(ctx.prisma, res.body.id);

    const calls = ctx.docker.createContainer.mock.calls as Array<
      [string, { HostConfig?: { NanoCpus?: number; Memory?: number } }]
    >;
    // No container create call should carry CPU/memory caps.
    expect(calls.some((c) => c[1]?.HostConfig?.NanoCpus)).toBe(false);
  });
});

import request from 'supertest';
import { DeploymentStatus } from '@prisma/client';
import {
  bootstrapE2E,
  E2EContext,
  waitForDeploymentStatus,
} from '../setup-e2e';
import { createTestFixtures } from '../utils/test-fixtures';

/**
 * Test 2 — rollback pins to a PREVIOUS successful deployment's immutable digest.
 *
 * Real semantics (deployments-rollback.service.ts): rollback(X) redeploys the
 * MOST RECENT successful deployment OTHER than X, using its imageSha. So to roll
 * back to the OLD image we call rollback() on the NEWER deployment — the service
 * then re-points to the OLDER success's digest. (The prompt's scenario had the
 * target/expectation inverted; this asserts the actual, correct behaviour.)
 *
 * Key assertion: the executor pulls the OLD digest (proves the pin), not the
 * newer one. After a successful redeploy the executor overwrites imageSha with
 * the freshly-resolved digest, so we assert on what was PULLED, not the final row.
 */
describe('Rollback (e2e)', () => {
  let ctx: E2EContext;
  const OLD_SHA =
    'sha256:0ld0000000000000000000000000000000000000000000000000000000000000';
  const NEW_SHA =
    'sha256:new0000000000000000000000000000000000000000000000000000000000000';

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

  it('rollback re-points to the previous success and pulls its digest', async () => {
    const f = await createTestFixtures(ctx.prisma);

    const base = {
      projectId: f.projectId,
      environmentId: f.environmentId,
      serviceId: f.serviceId,
      serviceEnvId: f.serviceEnvId,
      userId: f.userId,
      branch: 'main',
      status: DeploymentStatus.SUCCESS,
    };

    const oldDeployment = await ctx.prisma.deployment.create({
      data: {
        ...base,
        dockerImage: 'deployautomation/e2e:old',
        imageSha: OLD_SHA,
        createdAt: new Date(Date.now() - 60_000),
        startedAt: new Date(Date.now() - 60_000),
        finishedAt: new Date(Date.now() - 55_000),
      },
      select: { id: true },
    });

    const newDeployment = await ctx.prisma.deployment.create({
      data: {
        ...base,
        dockerImage: 'deployautomation/e2e:new',
        imageSha: NEW_SHA,
        createdAt: new Date(),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      select: { id: true },
    });

    // Roll back the NEWER deployment → service re-points to the OLDER success.
    const res = await request(ctx.app.getHttpServer())
      .post(`/deployments/${newDeployment.id}/rollback`)
      .set('Cookie', ctx.authCookie(f.userId));

    expect([200, 201]).toContain(res.status);
    const rollbackId: string = res.body.id;
    expect(rollbackId).toBeTruthy();

    const rollbackRow = await ctx.prisma.deployment.findUnique({
      where: { id: rollbackId },
      select: { isRollback: true, previousDeploymentId: true },
    });
    expect(rollbackRow?.isRollback).toBe(true);
    expect(rollbackRow?.previousDeploymentId).toBe(oldDeployment.id);

    const final = await waitForDeploymentStatus(ctx.prisma, rollbackId);
    expect(final.status).toBe('SUCCESS');

    // The pin: the executor pulled the OLD digest, never the newer one.
    // pullImage(serverId, imageRef, pullAuth) — pullAuth is undefined for an
    // anonymous (public) pull.
    expect(ctx.docker.pullImage).toHaveBeenCalledWith(
      expect.any(String),
      OLD_SHA,
      undefined,
    );
    expect(ctx.docker.pullImage).not.toHaveBeenCalledWith(
      expect.any(String),
      NEW_SHA,
    );
  });
});

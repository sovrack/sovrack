import { DeploymentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  bootstrapE2E,
  E2EContext,
  waitForDeploymentStatus,
} from '../setup-e2e';
import { createTestFixtures, TestFixtures } from '../utils/test-fixtures';
import { DockerDeployExecutorService } from '../../src/modules/deployments/core/docker-deploy-executor.service';
import { DeploymentsHealthcheckService } from '../../src/modules/deployments/health/deployments-healthcheck.service';

/**
 * C2 (Sprints 4+5+6 mission) — full integration coverage of the REAL
 * DockerDeployExecutorService.executeDeploy(), calling it directly (bypassing
 * DeploymentsCreateService/DeploymentPreflightService, which already have
 * their own dedicated unit/e2e coverage — see deployment-preflight.service.spec.ts
 * and deployments.e2e-spec.ts) so these failure paths exercise the EXECUTOR's
 * own error handling specifically, not the pre-flight guard in front of it.
 *
 * The nominal (happy-path) case is already covered end to end by
 * deploy-manual.e2e-spec.ts (via the real HTTP create→deploy flow); this file
 * adds the 3 realistic failure paths that were missing: an unreachable
 * server, a failed post-deploy health-check, and a host-port conflict.
 */
describe('DockerDeployExecutorService.executeDeploy — failure paths (e2e)', () => {
  let ctx: E2EContext;
  let executor: DockerDeployExecutorService;
  let healthcheck: { runPostDeployHealthChecks: jest.Mock };

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    executor = ctx.app.get(DockerDeployExecutorService);
    healthcheck = ctx.app.get(DeploymentsHealthcheckService);
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    ctx.docker.reset();
    healthcheck.runPostDeployHealthChecks.mockResolvedValue(
      '[HEALTH] skipped in e2e',
    );
    await ctx.resetDb();
  });

  /** Create a fresh PENDING Deployment row directly (bypasses create()/preflight). */
  async function createPendingDeployment(
    ctxLocal: E2EContext,
    f: TestFixtures,
  ): Promise<string> {
    const deployment = await ctxLocal.prisma.deployment.create({
      data: {
        id: randomUUID(),
        projectId: f.projectId,
        environmentId: f.environmentId,
        serviceId: f.serviceId,
        serviceEnvId: f.serviceEnvId,
        userId: f.userId,
        branch: 'main',
        status: DeploymentStatus.PENDING,
        dockerImage: 'platform/e2e:test',
      },
      select: { id: true },
    });
    return deployment.id;
  }

  it('unreachable server: a rejected Docker call fails the deployment (not left hanging)', async () => {
    const f = await createTestFixtures(ctx.prisma);
    const deploymentId = await createPendingDeployment(ctx, f);

    ctx.docker.createContainer.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 10.0.0.1:2376'),
    );

    // handleDeployFailure marks the deployment FAILED in the DB, then
    // rethrows (executeDeploy's contract: the caller learns the deploy
    // failed) — the queue-consumer/reconciler callers already .catch() this.
    await expect(executor.executeDeploy(deploymentId)).rejects.toThrow();

    const final = await waitForDeploymentStatus(ctx.prisma, deploymentId);
    expect(final.status).toBe('FAILED');
    expect(JSON.stringify(final.conditions)).toContain('Degraded');
  });

  it('failed health-check: the unhealthy container is stopped and the deployment is marked FAILED', async () => {
    const f = await createTestFixtures(ctx.prisma);
    const deploymentId = await createPendingDeployment(ctx, f);

    healthcheck.runPostDeployHealthChecks.mockRejectedValueOnce(
      new Error('Health check failed: HTTP 503 on /health'),
    );

    await expect(executor.executeDeploy(deploymentId)).rejects.toThrow();

    const final = await waitForDeploymentStatus(ctx.prisma, deploymentId);
    expect(final.status).toBe('FAILED');
    expect(ctx.docker.stopContainer).toHaveBeenCalled();

    const container = await ctx.prisma.container.findFirst({
      where: { deploymentId },
    });
    expect(container?.status).toBe('EXITED');
  });

  it('port conflict: a foreign container already publishing the target port fails the deployment before creating a container', async () => {
    const f = await createTestFixtures(ctx.prisma);
    const deploymentId = await createPendingDeployment(ctx, f);

    // Service.port defaults to 3000 (no override in fixtures); a foreign
    // container (name not matching this service's container prefix)
    // already publishes it on the same server.
    ctx.docker.listContainers.mockResolvedValueOnce([
      {
        Id: 'foreign-container-id',
        Names: ['/some-other-app'],
        Ports: [{ PublicPort: 3000 }],
      },
    ]);

    await expect(executor.executeDeploy(deploymentId)).rejects.toThrow(
      /port hôte 3000 est déjà utilisé/,
    );

    const final = await waitForDeploymentStatus(ctx.prisma, deploymentId);
    expect(final.status).toBe('FAILED');
    expect(final.conditions ? JSON.stringify(final.conditions) : '').toContain(
      'Degraded',
    );
    expect(ctx.docker.createContainer).not.toHaveBeenCalled();
  });
});

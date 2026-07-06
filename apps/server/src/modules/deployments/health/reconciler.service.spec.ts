import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DockerDeployExecutorService } from '../core/docker-deploy-executor.service';
import { ReconcilerService } from './reconciler.service';

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'se1',
    serviceId: 'svc1',
    environmentId: 'env1',
    service: { projectId: 'p1' },
    deployments: [
      {
        id: 'd1',
        branch: 'main',
        specSnapshot: {},
        resolvedRefs: { serverId: 'srv1' },
        dockerImage: 'img:1',
        imageSha: 'sha256:abc',
        buildId: 'build-1',
        isAutoHealed: false,
        createdAt: new Date(Date.now() - 3_600_000),
        containers: [{ id: 'c1', dockerId: 'dock1', name: 'app' }],
        ...overrides,
      },
    ],
  };
}

describe('ReconcilerService', () => {
  let service: ReconcilerService;
  let prisma: {
    serviceEnvironment: { findMany: jest.Mock };
    deployment: { count: jest.Mock; update: jest.Mock; create: jest.Mock };
  };
  let dockerApi: { inspectContainer: jest.Mock };
  let executor: { executeDeploy: jest.Mock };
  let notifications: {
    notifyAutoHeal: jest.Mock;
    notifyConfigDrift: jest.Mock;
  };
  let preflight: { assertServerReady: jest.Mock };

  beforeEach(() => {
    prisma = {
      serviceEnvironment: {
        findMany: jest.fn().mockResolvedValue([makeCandidate()]),
      },
      deployment: {
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'heal1' }),
      },
    };
    dockerApi = { inspectContainer: jest.fn() };
    executor = { executeDeploy: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      notifyAutoHeal: jest.fn().mockResolvedValue(undefined),
      notifyConfigDrift: jest.fn().mockResolvedValue(undefined),
    };
    preflight = { assertServerReady: jest.fn().mockResolvedValue(undefined) };
    service = new ReconcilerService(
      prisma as unknown as PrismaService,
      dockerApi as unknown as DockerApiService,
      executor as unknown as DockerDeployExecutorService,
      notifications as unknown as NotificationsService,
      preflight as never,
    );
  });

  it('does nothing when the container is RUNNING', async () => {
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'running' },
    });
    await service.reconcile();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
    expect(executor.executeDeploy).not.toHaveBeenCalled();
    expect(notifications.notifyAutoHeal).not.toHaveBeenCalled();
  });

  it('creates an auto-heal deployment when the container is EXITED', async () => {
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'exited' },
    });
    await service.reconcile();
    expect(preflight.assertServerReady).toHaveBeenCalledWith('srv1');
    expect(prisma.deployment.create).toHaveBeenCalledTimes(1);
    expect(prisma.deployment.create.mock.calls[0][0].data).toMatchObject({
      isAutoHealed: true,
      autoHealReason: 'container_exited',
      previousDeploymentId: 'd1',
      // Regression: without this, the healed deployment has no Build
      // relation, so the executor derives isLocalBuild=false regardless of
      // how the original deployment was built — risking a registry pull of
      // an image that was never pushed for a locally-built service.
      buildId: 'build-1',
    });
    expect(executor.executeDeploy).toHaveBeenCalledWith('heal1', 'sha256:abc');
    expect(notifications.notifyAutoHeal).toHaveBeenCalledTimes(1);
  });

  // C1 (Sprints 4+5+6 mission): minimal server guard before auto-healing.
  it('does not auto-heal onto a server that is not ready (guard rejects)', async () => {
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'exited' },
    });
    preflight.assertServerReady.mockRejectedValue(
      new Error('Le serveur « srv1 » est désactivé.'),
    );
    await expect(service.reconcile()).resolves.toBeUndefined();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
    expect(executor.executeDeploy).not.toHaveBeenCalled();
  });

  it('skips when a deployment is already in flight', async () => {
    prisma.deployment.count.mockResolvedValue(1);
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'exited' },
    });
    await service.reconcile();
    expect(dockerApi.inspectContainer).not.toHaveBeenCalled();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
  });

  it('does not crash when the Docker API call fails', async () => {
    dockerApi.inspectContainer.mockRejectedValue(
      new Error('no docker connection'),
    );
    await expect(service.reconcile()).resolves.toBeUndefined();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
  });

  it('respects the heal cooldown (recent auto-heal → skip)', async () => {
    prisma.serviceEnvironment.findMany.mockResolvedValue([
      makeCandidate({ isAutoHealed: true, createdAt: new Date() }),
    ]);
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'exited' },
    });
    await service.reconcile();
    expect(dockerApi.inspectContainer).not.toHaveBeenCalled();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
  });

  it('skips an env with no container yet (nothing deployed)', async () => {
    prisma.serviceEnvironment.findMany.mockResolvedValue([
      makeCandidate({ containers: [] }),
    ]);
    await service.reconcile();
    expect(dockerApi.inspectContainer).not.toHaveBeenCalled();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
  });

  it('skips a legacy row with no resolved serverId', async () => {
    prisma.serviceEnvironment.findMany.mockResolvedValue([
      makeCandidate({ resolvedRefs: {} }),
    ]);
    await service.reconcile();
    expect(dockerApi.inspectContainer).not.toHaveBeenCalled();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
  });

  it('does not crash when the auto-heal deploy itself fails', async () => {
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'exited' },
    });
    executor.executeDeploy.mockRejectedValue(new Error('pull failed'));
    await service.reconcile();
    // executeDeploy is fire-and-forget (void … .catch) → let the rejection
    // handler run on the next microtask, then assert nothing leaked.
    await new Promise((r) => setImmediate(r));
    expect(prisma.deployment.create).toHaveBeenCalledTimes(1);
  });

  it('does not crash when the auto-heal notification fails', async () => {
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'exited' },
    });
    notifications.notifyAutoHeal.mockRejectedValue(new Error('smtp down'));
    await expect(service.reconcile()).resolves.toBeUndefined();
    expect(prisma.deployment.create).toHaveBeenCalledTimes(1);
  });

  // ── L2 : conteneur DISPARU (404) ────────────────────────────────────────
  it('heals a MISSING container (inspect 404) — recreates it', async () => {
    dockerApi.inspectContainer.mockRejectedValue(
      Object.assign(new Error('no such container'), { statusCode: 404 }),
    );
    await service.reconcile();
    expect(prisma.deployment.create).toHaveBeenCalledTimes(1);
    expect(prisma.deployment.create.mock.calls[0][0].data).toMatchObject({
      isAutoHealed: true,
      autoHealReason: 'container_missing',
      previousDeploymentId: 'd1',
    });
  });

  it('does NOT heal when inspect fails with a generic (non-404) error', async () => {
    dockerApi.inspectContainer.mockRejectedValue(
      new Error('no docker connection'),
    );
    await service.reconcile();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
  });

  // ── L1 : dérive de CONFIG (generation > observedGeneration) ──────────────
  function makeDriftCandidate(
    generation: number,
    observedGeneration: number | null,
    conditions: unknown = null,
  ) {
    return {
      id: 'se1',
      serviceId: 'svc1',
      environmentId: 'env1',
      generation,
      service: { projectId: 'p1' },
      deployments: [
        {
          id: 'd1',
          branch: 'main',
          specSnapshot: {},
          resolvedRefs: { serverId: 'srv1' },
          conditions,
          observedGeneration,
          dockerImage: 'img:1',
          imageSha: 'sha256:abc',
          isAutoHealed: false,
          createdAt: new Date(Date.now() - 3_600_000),
          containers: [{ id: 'c1', dockerId: 'dock1', name: 'app' }],
        },
      ],
    };
  }

  it('flags OutOfSync when desired generation > observed (running container)', async () => {
    prisma.serviceEnvironment.findMany.mockResolvedValue([
      makeDriftCandidate(5, 4),
    ]);
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'running' },
    });
    await service.reconcile();
    expect(prisma.deployment.create).not.toHaveBeenCalled(); // pas de redeploy auto
    expect(prisma.deployment.update).toHaveBeenCalledTimes(1);
    const conditions = prisma.deployment.update.mock.calls[0][0].data
      .conditions as Array<{ reason: string }>;
    expect(conditions[0].reason).toBe('ConfigDrift');
  });

  it('is idempotent: does not re-flag an already-OutOfSync deployment', async () => {
    prisma.serviceEnvironment.findMany.mockResolvedValue([
      makeDriftCandidate(5, 4, [{ reason: 'ConfigDrift' }]),
    ]);
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'running' },
    });
    await service.reconcile();
    expect(prisma.deployment.update).not.toHaveBeenCalled();
  });

  it('does nothing when config is in sync (generation == observed)', async () => {
    prisma.serviceEnvironment.findMany.mockResolvedValue([
      makeDriftCandidate(4, 4),
    ]);
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'running' },
    });
    await service.reconcile();
    expect(prisma.deployment.update).not.toHaveBeenCalled();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
  });

  // ── L3 : le pointeur "release courante" est la source autoritaire ─────────
  it('reconciles the CURRENT deployment (pointer), not last SUCCESS by date', async () => {
    const dep = (id: string, dockerId: string) => ({
      id,
      branch: 'main',
      specSnapshot: {},
      resolvedRefs: { serverId: 'srv1' },
      conditions: null,
      observedGeneration: 1,
      dockerImage: `img:${id}`,
      imageSha: `sha256:${id}`,
      isAutoHealed: false,
      createdAt: new Date(Date.now() - 3_600_000),
      containers: [{ id: `c-${id}`, dockerId, name: `app-${id}` }],
    });
    prisma.serviceEnvironment.findMany.mockResolvedValue([
      {
        id: 'se1',
        serviceId: 'svc1',
        environmentId: 'env1',
        generation: 1,
        service: { projectId: 'p1' },
        currentDeployment: dep('cur', 'CURRENT-dock'),
        deployments: [dep('old', 'OLD-dock')], // dernier SUCCESS par date (≠ pointeur)
      },
    ]);
    dockerApi.inspectContainer.mockResolvedValue({
      State: { Status: 'running' },
    });
    await service.reconcile();
    // C'est le conteneur du POINTEUR qui est inspecté, pas celui du fallback.
    expect(dockerApi.inspectContainer).toHaveBeenCalledWith(
      'srv1',
      'CURRENT-dock',
    );
  });
});

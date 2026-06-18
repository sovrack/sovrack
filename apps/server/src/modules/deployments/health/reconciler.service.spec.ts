import { PrismaService } from '../../../core/database/prisma.service';
import { DockerApiService } from '../../../core/container-runtime/docker-api.service';
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
  let notifications: { notifyAutoHeal: jest.Mock };

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
    notifications = { notifyAutoHeal: jest.fn().mockResolvedValue(undefined) };
    service = new ReconcilerService(
      prisma as unknown as PrismaService,
      dockerApi as unknown as DockerApiService,
      executor as unknown as DockerDeployExecutorService,
      notifications as unknown as NotificationsService,
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
    expect(prisma.deployment.create).toHaveBeenCalledTimes(1);
    expect(prisma.deployment.create.mock.calls[0][0].data).toMatchObject({
      isAutoHealed: true,
      autoHealReason: 'container_exited',
      previousDeploymentId: 'd1',
    });
    expect(executor.executeDeploy).toHaveBeenCalledWith('heal1', 'sha256:abc');
    expect(notifications.notifyAutoHeal).toHaveBeenCalledTimes(1);
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
});

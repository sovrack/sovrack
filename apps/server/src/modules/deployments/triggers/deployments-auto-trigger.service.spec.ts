import { Test, TestingModule } from '@nestjs/testing';
import {
  DeploymentStatus,
  BuildPack,
  BuildTrigger,
  BuildStatus,
} from '@prisma/client';
import { DeploymentsAutoTriggerService } from './deployments-auto-trigger.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { BuildLifecycleService } from '../../build/lifecycle/build-lifecycle.service';
import { QueueService } from '../../../shared/queue/queue.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { DeploymentPreflightService } from '../core/deployment-preflight.service';

const PROJECT_ID = 'project-1';
const SVC_ENV_ID = 'svcenv-1';
const ENV_ID = 'env-1';
const SVC_ID = 'svc-1';
const BUILD_ID = 'build-1';
const DEPLOYMENT_ID = 'deploy-1';
const BRANCH = 'main';

const makeSvcEnv = (overrides: Record<string, unknown> = {}) => ({
  id: SVC_ENV_ID,
  serviceId: SVC_ID,
  environmentId: ENV_ID,
  buildPack: null,
  // ServiceEnvironment-level overrides (null = inherit from service)
  port: null,
  startCommand: null,
  healthcheckPath: null,
  replicas: null,
  generation: 1,
  service: {
    buildPack: BuildPack.DOCKERFILE,
    buildMode: null,
    sourceType: null,
    nixpacksConfig: null,
    staticConfig: null,
    repoPath: null,
    dockerfile: null,
    rootDir: '/',
    port: 3000,
    startCommand: null,
    healthcheckPath: null,
    replicas: 1,
    cpuLimit: null,
    memLimitMb: null,
    buildArgs: null,
  },
  environment: {
    id: ENV_ID,
    isProtected: false,
    name: 'production',
    project: { id: PROJECT_ID, maxConcurrentDeploys: null },
  },
  ...overrides,
});

/** Build a prisma mock that supports acquireDeploySlot (advisory lock + stale
 * recovery + findFirst) inside the transaction via $executeRaw + updateMany. */
const makePrisma = () => ({
  serviceEnvironment: { findMany: jest.fn(), findUnique: jest.fn() },
  deployment: {
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  $transaction: jest.fn(),
  $executeRaw: jest.fn().mockResolvedValue(undefined),
});

const makeQueue = () => ({
  enqueueDeploy: jest.fn().mockResolvedValue('job-1'),
});

const makeBuilds = () => ({ create: jest.fn() });

const makeGateway = () => ({
  emitStarted: jest.fn(),
  emitStatus: jest.fn(),
  emitFinished: jest.fn(),
});

const makePreflight = () => ({
  assertDeployable: jest.fn().mockResolvedValue(undefined),
});

describe('DeploymentsAutoTriggerService', () => {
  let service: DeploymentsAutoTriggerService;
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let gateway: ReturnType<typeof makeGateway>;
  let buildsService: ReturnType<typeof makeBuilds>;
  let preflight: ReturnType<typeof makePreflight>;

  beforeEach(async () => {
    prisma = makePrisma();
    queue = makeQueue();
    gateway = makeGateway();
    buildsService = makeBuilds();
    preflight = makePreflight();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeploymentsAutoTriggerService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queue },
        { provide: DeploymentEventsPublisher, useValue: gateway },
        { provide: BuildLifecycleService, useValue: buildsService },
        { provide: DeploymentPreflightService, useValue: preflight },
      ],
    }).compile();

    service = module.get(DeploymentsAutoTriggerService);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'debug').mockImplementation(() => undefined);
  });

  describe('triggerAutoDeployIfConfigured', () => {
    it('returns early when no autoDeploy=true ServiceEnvironments match', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([]);

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(queue.enqueueDeploy).not.toHaveBeenCalled();
    });

    it('creates deployment and enqueues job for matching ServiceEnvironment', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([makeSvcEnv()]);
      // No pipeline ID → dedup block skipped; acquireDeploySlot findFirst → null (no in-flight)
      prisma.deployment.findFirst.mockResolvedValue(null);

      const build = { id: BUILD_ID };
      const deployment = {
        id: DEPLOYMENT_ID,
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
      };
      buildsService.create.mockResolvedValue(build);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.deployment.create.mockResolvedValue(deployment);

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      expect(buildsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          branch: BRANCH,
          buildPack: BuildPack.DOCKERFILE,
          triggeredBy: BuildTrigger.WEBHOOK,
          initialStatus: BuildStatus.BUILDING,
          userId: null,
        }),
        prisma,
      );
      expect(gateway.emitStarted).toHaveBeenCalledWith(
        expect.objectContaining({ deploymentId: DEPLOYMENT_ID }),
      );
      expect(queue.enqueueDeploy).toHaveBeenCalledWith(
        DEPLOYMENT_ID,
        undefined,
      );
    });

    it('deployment create receives specSnapshot and observedGeneration', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([
        makeSvcEnv({ generation: 5 }),
      ]);
      prisma.deployment.findFirst.mockResolvedValue(null);
      buildsService.create.mockResolvedValue({ id: BUILD_ID });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.deployment.create.mockResolvedValue({
        id: DEPLOYMENT_ID,
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
      });

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      const createArgs = prisma.deployment.create.mock.calls[0][0]
        .data as Record<string, unknown>;
      expect(createArgs).toHaveProperty('specSnapshot');
      expect(createArgs).toHaveProperty('observedGeneration', 5);
      expect(createArgs.specSnapshot).toMatchObject({ branch: BRANCH });
    });

    it('skips a protected environment (webhook/system cannot deploy there)', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([
        makeSvcEnv({
          environment: {
            id: ENV_ID,
            isProtected: true,
            name: 'production',
            project: { id: PROJECT_ID, maxConcurrentDeploys: null },
          },
        }),
      ]);

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      expect(prisma.deployment.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(queue.enqueueDeploy).not.toHaveBeenCalled();
    });

    it('skips ServiceEnvironment when deployment with same pipeline ID already exists', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([makeSvcEnv()]);
      prisma.deployment.findFirst.mockResolvedValue({ id: 'existing-deploy' });

      await service.triggerAutoDeployIfConfigured(
        PROJECT_ID,
        BRANCH,
        undefined,
        42,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(queue.enqueueDeploy).not.toHaveBeenCalled();
    });

    it('skips (logs error) when a deployment is already in flight for the service-env (concurrency guard inside tx)', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([makeSvcEnv()]);
      // acquireDeploySlot: $executeRaw OK → updateMany (stale, 0 rows) → findFirst finds in-flight → throws
      prisma.deployment.findFirst.mockResolvedValue({
        id: 'in-flight-deploy',
        status: 'RUNNING',
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      // Transaction is entered but throws internally via acquireDeploySlot;
      // the outer catch logs the error — no job must be enqueued.
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(queue.enqueueDeploy).not.toHaveBeenCalled();
    });

    it('uses NIXPACKS buildPack from service when ServiceEnvironment buildPack is null', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([
        makeSvcEnv({
          service: {
            buildPack: BuildPack.NIXPACKS,
            buildMode: null,
            sourceType: null,
            nixpacksConfig: null,
            staticConfig: null,
            repoPath: null,
            dockerfile: null,
            rootDir: '/',
            port: 3000,
            startCommand: null,
            healthcheckPath: null,
            replicas: 1,
            cpuLimit: null,
            memLimitMb: null,
            buildArgs: null,
          },
        }),
      ]);
      prisma.deployment.findFirst.mockResolvedValue(null);
      buildsService.create.mockResolvedValue({ id: BUILD_ID });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.deployment.create.mockResolvedValue({
        id: DEPLOYMENT_ID,
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
      });

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      expect(buildsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          buildPack: BuildPack.NIXPACKS,
          isLocalBuild: true,
        }),
        prisma,
      );
    });

    it('builds locally for DOCKERFILE + buildMode LOCAL (default for a new service) instead of attempting a registry pull', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([
        makeSvcEnv({
          service: {
            buildPack: BuildPack.DOCKERFILE,
            buildMode: 'LOCAL',
            sourceType: null,
            nixpacksConfig: null,
            staticConfig: null,
            repoPath: null,
            dockerfile: null,
            rootDir: '/',
            port: 3000,
            startCommand: null,
            healthcheckPath: null,
            replicas: 1,
            cpuLimit: null,
            memLimitMb: null,
            buildArgs: null,
          },
        }),
      ]);
      prisma.deployment.findFirst.mockResolvedValue(null);
      buildsService.create.mockResolvedValue({ id: BUILD_ID });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.deployment.create.mockResolvedValue({
        id: DEPLOYMENT_ID,
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
      });

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      expect(buildsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          buildPack: BuildPack.DOCKERFILE,
          isLocalBuild: true,
        }),
        prisma,
      );
    });

    it('pulls from the registry for NIXPACKS + buildMode REGISTRY instead of rebuilding locally', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([
        makeSvcEnv({
          service: {
            buildPack: BuildPack.NIXPACKS,
            buildMode: 'REGISTRY',
            sourceType: null,
            nixpacksConfig: null,
            staticConfig: null,
            repoPath: null,
            dockerfile: null,
            rootDir: '/',
            port: 3000,
            startCommand: null,
            healthcheckPath: null,
            replicas: 1,
            cpuLimit: null,
            memLimitMb: null,
            buildArgs: null,
          },
        }),
      ]);
      prisma.deployment.findFirst.mockResolvedValue(null);
      buildsService.create.mockResolvedValue({ id: BUILD_ID });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.deployment.create.mockResolvedValue({
        id: DEPLOYMENT_ID,
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
      });

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      expect(buildsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          buildPack: BuildPack.NIXPACKS,
          isLocalBuild: false,
        }),
        prisma,
      );
    });

    it('handles per-ServiceEnvironment errors gracefully without stopping others', async () => {
      const svcEnv2 = makeSvcEnv({ id: 'svcenv-2', environmentId: 'env-2' });
      prisma.serviceEnvironment.findMany.mockResolvedValue([
        makeSvcEnv(),
        svcEnv2,
      ]);
      prisma.deployment.findFirst.mockResolvedValue(null);

      prisma.$transaction
        .mockRejectedValueOnce(new Error('DB error on svcenv-1'))
        .mockImplementationOnce(
          async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
        );

      const deployment2 = {
        id: 'deploy-2',
        projectId: PROJECT_ID,
        environmentId: 'env-2',
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
      };
      buildsService.create.mockResolvedValue({ id: BUILD_ID });
      prisma.deployment.create.mockResolvedValue(deployment2);

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      expect(queue.enqueueDeploy).toHaveBeenCalledTimes(1);
      expect(queue.enqueueDeploy).toHaveBeenCalledWith('deploy-2', undefined);
    });

    it('calls the preflight guard with serviceEnvId/branch/overrideImage before any write', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([makeSvcEnv()]);
      prisma.deployment.findFirst.mockResolvedValue(null);
      buildsService.create.mockResolvedValue({ id: BUILD_ID });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      prisma.deployment.create.mockResolvedValue({
        id: DEPLOYMENT_ID,
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
      });

      await service.triggerAutoDeployIfConfigured(
        PROJECT_ID,
        BRANCH,
        'registry.example.com/img:tag',
      );

      expect(preflight.assertDeployable).toHaveBeenCalledWith({
        serviceEnvId: SVC_ENV_ID,
        branch: BRANCH,
        overrideImage: 'registry.example.com/img:tag',
      });
    });

    it('rejects (logs, no throw) without creating a deployment when the preflight fails — does not fail the webhook', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([makeSvcEnv()]);
      preflight.assertDeployable.mockRejectedValue(
        new Error('Aucun Dockerfile trouvé sur la branche « main »'),
      );

      await expect(
        service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH),
      ).resolves.toBeUndefined();

      expect(prisma.deployment.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(buildsService.create).not.toHaveBeenCalled();
      expect(queue.enqueueDeploy).not.toHaveBeenCalled();
      expect(service['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('[PREFLIGHT REJECTED]'),
      );
    });

    it('a preflight rejection for one ServiceEnvironment does not block the others', async () => {
      const svcEnv2 = makeSvcEnv({ id: 'svcenv-2', environmentId: 'env-2' });
      prisma.serviceEnvironment.findMany.mockResolvedValue([
        makeSvcEnv(),
        svcEnv2,
      ]);
      preflight.assertDeployable.mockImplementation(
        (input: { serviceEnvId: string }) =>
          input.serviceEnvId === SVC_ENV_ID
            ? Promise.reject(new Error('not ready'))
            : Promise.resolve(undefined),
      );
      prisma.deployment.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      );
      buildsService.create.mockResolvedValue({ id: BUILD_ID });
      prisma.deployment.create.mockResolvedValue({
        id: 'deploy-2',
        projectId: PROJECT_ID,
        environmentId: 'env-2',
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
      });

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      expect(queue.enqueueDeploy).toHaveBeenCalledTimes(1);
      expect(queue.enqueueDeploy).toHaveBeenCalledWith('deploy-2', undefined);
    });
  });
});

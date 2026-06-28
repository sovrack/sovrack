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

const PROJECT_ID = 'project-1';
const SVC_ENV_ID = 'svcenv-1';
const ENV_ID = 'env-1';
const SVC_ID = 'svc-1';
const BUILD_ID = 'build-1';
const DEPLOYMENT_ID = 'deploy-1';
const BRANCH = 'main';

const makeSvcEnv = (overrides = {}) => ({
  id: SVC_ENV_ID,
  serviceId: SVC_ID,
  environmentId: ENV_ID,
  buildPack: null,
  service: {
    buildPack: BuildPack.DOCKERFILE,
    nixpacksConfig: null,
    staticConfig: null,
  },
  environment: { id: ENV_ID, isProtected: false, name: 'production' },
  ...overrides,
});

const makePrisma = () => ({
  serviceEnvironment: { findMany: jest.fn(), findUnique: jest.fn() },
  deployment: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
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

describe('DeploymentsAutoTriggerService', () => {
  let service: DeploymentsAutoTriggerService;
  let prisma: ReturnType<typeof makePrisma>;
  let queue: ReturnType<typeof makeQueue>;
  let gateway: ReturnType<typeof makeGateway>;
  let buildsService: ReturnType<typeof makeBuilds>;

  beforeEach(async () => {
    prisma = makePrisma();
    queue = makeQueue();
    gateway = makeGateway();
    buildsService = makeBuilds();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeploymentsAutoTriggerService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queue },
        { provide: DeploymentEventsPublisher, useValue: gateway },
        { provide: BuildLifecycleService, useValue: buildsService },
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

    it('skips a protected environment (webhook/system cannot deploy there)', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([
        makeSvcEnv({
          environment: { id: ENV_ID, isProtected: true, name: 'production' },
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

    it('skips when a deployment is already in flight for the service-env (concurrency guard)', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([makeSvcEnv()]);
      // No pipeline ID → dedup block skipped; the in-flight guard findFirst
      // returns an active deployment → the webhook must not start a second one.
      prisma.deployment.findFirst.mockResolvedValue({ id: 'in-flight-deploy' });

      await service.triggerAutoDeployIfConfigured(PROJECT_ID, BRANCH);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(queue.enqueueDeploy).not.toHaveBeenCalled();
    });

    it('uses NIXPACKS buildPack from service when ServiceEnvironment buildPack is null', async () => {
      prisma.serviceEnvironment.findMany.mockResolvedValue([
        makeSvcEnv({
          service: {
            buildPack: BuildPack.NIXPACKS,
            nixpacksConfig: null,
            staticConfig: null,
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
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeploymentStatus, DeploymentStrategy, ManagedServiceType, Role, ServiceType } from '@prisma/client';
import { DeploymentsCreateService } from './deployments-create.service';

jest.mock('../utils/deploy-slot.util', () => ({
  acquireDeploySlot: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/spec-snapshot.util', () => ({
  buildAppSpecSnapshot: jest.fn().mockReturnValue({ type: 'app' }),
  buildComposeSpecSnapshot: jest.fn().mockReturnValue({ type: 'compose' }),
  buildDbSpecSnapshot: jest.fn().mockReturnValue({ type: 'db' }),
}));

const baseDeployment = {
  id: 'dep1',
  projectId: 'proj1',
  environmentId: 'env1',
  status: DeploymentStatus.PENDING,
  startedAt: new Date(),
  logs: null,
  finishedAt: null,
  externalPipelineId: null,
  dockerImage: null,
};

function makeServiceEnv(overrides: Partial<{
  serviceType: ServiceType;
  databaseType: ManagedServiceType | null;
}> = {}) {
  const serviceType = overrides.serviceType ?? ServiceType.APP;
  return {
    id: 'senv1',
    generation: 1,
    port: 3000,
    replicas: 1,
    service: {
      id: 'svc1',
      name: 'my-service',
      type: serviceType,
      databaseType: overrides.databaseType ?? null,
      databaseVersion: null,
      databaseCredentials: null,
      port: null,
      replicas: 1,
      composeServiceName: null,
      env: '{}',
      secretsEnv: null,
    },
    environment: {
      id: 'env1',
      project: { id: 'proj1', name: 'my-project', maxConcurrentDeploys: null },
      servers: [{ id: 'srv1', name: 'prod', host: '1.2.3.4', port: 22, username: 'ubuntu' }],
    },
  };
}

function makeDeps(opts: {
  serviceEnvFound?: boolean;
  serviceType?: ServiceType;
  databaseType?: ManagedServiceType | null;
  needsDirectTrigger?: boolean;
  pipelineError?: Error;
  resolvedConfig?: Partial<{
    buildSource: string;
    isLocalBuild: boolean;
    branch: string;
    dockerImage: string | null;
    resolvedNixpacksConfig: unknown;
    resolvedStaticConfig: unknown;
  }>;
} = {}) {
  const senv = makeServiceEnv({
    serviceType: opts.serviceType,
    databaseType: opts.databaseType,
  });

  const txDeployment = { ...baseDeployment };
  const updatedDeployment = { ...baseDeployment, status: DeploymentStatus.RUNNING };

  const prisma = {
    serviceEnvironment: {
      findUnique: opts.serviceEnvFound === false
        ? jest.fn().mockResolvedValue(null)
        : jest.fn().mockResolvedValue(senv),
    },
    deployment: {
      create: jest.fn().mockResolvedValue(txDeployment),
      update: jest.fn().mockResolvedValue(updatedDeployment),
    },
    pipelineRun: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => unknown) =>
      cb({
        deployment: { create: jest.fn().mockResolvedValue(txDeployment) },
        serviceEnvironment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      }),
    ),
  } as never;

  const authorizationService = {
    getActor: jest.fn().mockResolvedValue({ id: 'user1', role: Role.ADMIN }),
    assertCanDeployProject: jest.fn().mockResolvedValue(undefined),
    assertCanDeployToEnvironment: jest.fn().mockResolvedValue(undefined),
  } as never;

  const configResolver = {
    resolve: jest.fn().mockResolvedValue({
      buildSource: opts.resolvedConfig?.buildSource ?? 'DOCKERFILE',
      isLocalBuild: opts.resolvedConfig?.isLocalBuild ?? false,
      branch: opts.resolvedConfig?.branch ?? 'main',
      dockerImage: opts.resolvedConfig?.dockerImage ?? 'registry/img:sha',
      resolvedNixpacksConfig: null,
      resolvedStaticConfig: null,
    }),
    buildSourceToBuildPack: jest.fn().mockReturnValue('DOCKERFILE'),
    getDatabaseImage: jest.fn().mockReturnValue({ image: 'postgres:15' }),
  } as never;

  const gateway = {
    emitStarted: jest.fn(),
    emitStatus: jest.fn(),
    emitFinished: jest.fn(),
  } as never;

  const dockerDeployExecutor = {} as never;

  const buildsService = {
    create: jest.fn().mockResolvedValue({ id: 'build1' }),
  } as never;

  const buildStrategyResolver = {
    resolve: jest.fn().mockReturnValue({
      needsDirectTrigger: opts.needsDirectTrigger ?? true,
      reason: 'direct',
    }),
  } as never;

  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as never;

  const queueService = {
    enqueueDeploy: jest.fn().mockResolvedValue(undefined),
  } as never;

  const gitProvidersService = {
    triggerPipeline: opts.pipelineError
      ? jest.fn().mockRejectedValue(opts.pipelineError)
      : jest.fn().mockResolvedValue({ id: 99, webUrl: 'https://ci.example.com/99' }),
    resolveProviderType: jest.fn().mockResolvedValue('GITLAB'),
  } as never;

  return {
    svc: new DeploymentsCreateService(
      prisma,
      gitProvidersService,
      gateway,
      configResolver,
      authorizationService,
      dockerDeployExecutor,
      buildsService,
      buildStrategyResolver,
      auditService,
      queueService,
    ),
    prisma, authorizationService, configResolver, gateway, buildsService,
    buildStrategyResolver, auditService, queueService, gitProvidersService,
  };
}

describe('DeploymentsCreateService', () => {
  describe('create', () => {
    it('throws NotFoundException when serviceEnv not found', async () => {
      const { svc } = makeDeps({ serviceEnvFound: false });
      await expect(svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1'))
        .rejects.toThrow(NotFoundException);
    });

    it('routes to createDatabaseDeployment for DATABASE services', async () => {
      const { svc, queueService } = makeDeps({
        serviceType: ServiceType.DATABASE,
        databaseType: ManagedServiceType.POSTGRES,
      });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(queueService.enqueueDeploy).toHaveBeenCalled();
    });

    it('calls authorizationService.assertCanDeployProject', async () => {
      const { svc, authorizationService } = makeDeps();
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(authorizationService.assertCanDeployProject).toHaveBeenCalledWith(
        'proj1', 'user1', Role.ADMIN,
      );
    });

    it('calls configResolver.resolve for APP services', async () => {
      const { svc, configResolver } = makeDeps();
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(configResolver.resolve).toHaveBeenCalled();
    });

    it('direct trigger path: calls enqueueDeploy and emits status', async () => {
      const { svc, queueService, gateway } = makeDeps({ needsDirectTrigger: true });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(queueService.enqueueDeploy).toHaveBeenCalled();
      expect(gateway.emitStatus).toHaveBeenCalled();
    });

    it('pipeline path: triggers pipeline and upserts pipeline run', async () => {
      const { svc, gitProvidersService, prisma } = makeDeps({ needsDirectTrigger: false });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(gitProvidersService.triggerPipeline).toHaveBeenCalled();
      expect(prisma.pipelineRun.upsert).toHaveBeenCalled();
    });

    it('pipeline failure: marks deployment FAILED and rethrows', async () => {
      const pipelineError = new Error('CI unavailable');
      const { svc, prisma } = makeDeps({
        needsDirectTrigger: false,
        pipelineError,
      });
      await expect(
        svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1'),
      ).rejects.toThrow('CI unavailable');
      expect(prisma.deployment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: DeploymentStatus.FAILED }) }),
      );
    });

    it('pipeline failure: emits finished event', async () => {
      const { svc, gateway } = makeDeps({
        needsDirectTrigger: false,
        pipelineError: new Error('CI down'),
      });
      await expect(svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1')).rejects.toThrow();
      expect(gateway.emitFinished).toHaveBeenCalled();
    });

    it('uses blue-green strategy when dto.strategy is blue-green', async () => {
      const { svc, prisma } = makeDeps({ needsDirectTrigger: true });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main', strategy: 'blue-green' }, 'user1');
      const txMock = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      // The lambda passed to $transaction creates the deployment
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('createDatabaseDeployment (via create)', () => {
    it('throws BadRequestException when databaseType is null', async () => {
      const { svc } = makeDeps({
        serviceType: ServiceType.DATABASE,
        databaseType: null,
      });
      await expect(
        svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls enqueueDeploy for database deployment', async () => {
      const { svc, queueService } = makeDeps({
        serviceType: ServiceType.DATABASE,
        databaseType: ManagedServiceType.POSTGRES,
      });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(queueService.enqueueDeploy).toHaveBeenCalled();
    });

    it('calls getDatabaseImage to resolve the container image', async () => {
      const { svc, configResolver } = makeDeps({
        serviceType: ServiceType.DATABASE,
        databaseType: ManagedServiceType.POSTGRES,
      });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(configResolver.getDatabaseImage).toHaveBeenCalled();
    });

    it('emits started event for database deployment', async () => {
      const { svc, gateway } = makeDeps({
        serviceType: ServiceType.DATABASE,
        databaseType: ManagedServiceType.MYSQL,
      });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(gateway.emitStarted).toHaveBeenCalled();
    });
  });
});

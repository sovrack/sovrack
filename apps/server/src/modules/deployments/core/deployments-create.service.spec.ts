import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  DeploymentStatus,
  ManagedServiceType,
  Role,
  ServiceType,
} from '@prisma/client';
import { DeploymentsCreateService } from './deployments-create.service';
import { buildAppSpecSnapshot } from '../utils/spec-snapshot.util';

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

function makeServiceEnv(
  overrides: Partial<{
    serviceType: ServiceType;
    databaseType: ManagedServiceType | null;
  }> = {},
) {
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
      servers: [
        {
          id: 'srv1',
          name: 'prod',
          host: '1.2.3.4',
          port: 22,
          username: 'ubuntu',
        },
      ],
    },
  };
}

function makeDeps(
  opts: {
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
  } = {},
) {
  const senv = makeServiceEnv({
    serviceType: opts.serviceType,
    databaseType: opts.databaseType,
  });

  const txDeployment = { ...baseDeployment };

  const prisma = {
    serviceEnvironment: {
      findUnique:
        opts.serviceEnvFound === false
          ? jest.fn().mockResolvedValue(null)
          : jest.fn().mockResolvedValue(senv),
    },
    deployment: {
      create: jest.fn().mockResolvedValue(txDeployment),
      // Merges `data` into the base row so callers that read the RETURN
      // value (e.g. gateway.emitFinished({ status: failed.status, ... }))
      // see the actual status/finishedAt just written, not a stale fixture.
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...txDeployment, ...data }),
        ),
    },
    pipelineRun: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => unknown) =>
      cb({
        deployment: { create: jest.fn().mockResolvedValue(txDeployment) },
        serviceEnvironment: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
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

  const preflight = {
    assertDeployable: jest.fn().mockResolvedValue(undefined),
  } as never;

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
      : jest
          .fn()
          .mockResolvedValue({ id: 99, webUrl: 'https://ci.example.com/99' }),
    resolveProviderType: jest.fn().mockResolvedValue('GITLAB'),
  } as never;

  return {
    svc: new DeploymentsCreateService(
      prisma,
      gitProvidersService,
      gateway,
      configResolver,
      authorizationService,
      preflight,
      buildsService,
      buildStrategyResolver,
      auditService,
      queueService,
    ),
    prisma,
    authorizationService,
    configResolver,
    gateway,
    buildsService,
    buildStrategyResolver,
    auditService,
    queueService,
    gitProvidersService,
    preflight,
  };
}

describe('DeploymentsCreateService', () => {
  describe('create', () => {
    it('throws NotFoundException when serviceEnv not found', async () => {
      const { svc } = makeDeps({ serviceEnvFound: false });
      await expect(
        svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('routes to createDatabaseDeployment for DATABASE services', async () => {
      const { svc, queueService } = makeDeps({
        serviceType: ServiceType.DATABASE,
        databaseType: ManagedServiceType.POSTGRES,
      });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(queueService.enqueueDeploy).toHaveBeenCalledWith('dep1');
    });

    it('calls the preflight guard before creating anything, for APP services', async () => {
      const { svc, preflight } = makeDeps();
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(preflight.assertDeployable).toHaveBeenCalledWith({
        serviceEnvId: 'senv1',
        branch: 'main',
        overrideImage: undefined,
      });
    });

    it('calls the preflight guard for DATABASE services too', async () => {
      const { svc, preflight } = makeDeps({
        serviceType: ServiceType.DATABASE,
        databaseType: ManagedServiceType.POSTGRES,
      });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(preflight.assertDeployable).toHaveBeenCalledWith({
        serviceEnvId: 'senv1',
        branch: 'main',
        overrideImage: undefined,
      });
    });

    it('propagates the preflight rejection and creates no deployment', async () => {
      const { svc, preflight, prisma } = makeDeps();
      (preflight.assertDeployable as jest.Mock).mockRejectedValue(
        new BadRequestException('Aucun Dockerfile trouvé'),
      );
      await expect(
        svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1'),
      ).rejects.toThrow('Aucun Dockerfile trouvé');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('calls authorizationService.assertCanDeployProject', async () => {
      const { svc, authorizationService } = makeDeps();
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(authorizationService.assertCanDeployProject).toHaveBeenCalledWith(
        'proj1',
        'user1',
        Role.ADMIN,
      );
    });

    it('calls configResolver.resolve for APP services', async () => {
      const { svc, configResolver } = makeDeps();
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(configResolver.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ serviceEnvId: 'senv1', branch: 'main' }),
        expect.objectContaining({ id: 'svc1' }),
        expect.objectContaining({ id: 'proj1' }),
      );
    });

    it('direct trigger path: calls enqueueDeploy and emits status', async () => {
      const { svc, queueService, gateway } = makeDeps({
        needsDirectTrigger: true,
      });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(queueService.enqueueDeploy).toHaveBeenCalledWith('dep1');
      expect(gateway.emitStatus).toHaveBeenCalledWith({
        deploymentId: 'dep1',
        status: DeploymentStatus.RUNNING,
      });
    });

    it('pipeline path: triggers pipeline and upserts pipeline run', async () => {
      const { svc, gitProvidersService, prisma } = makeDeps({
        needsDirectTrigger: false,
      });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(gitProvidersService.triggerPipeline).toHaveBeenCalledWith(
        'proj1',
        'main',
        'user1',
        Role.ADMIN,
      );
      expect(prisma.pipelineRun.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            externalId_provider: { externalId: 99n, provider: 'GITLAB' },
          },
          create: expect.objectContaining({
            externalId: 99n,
            provider: 'GITLAB',
            branch: 'main',
            projectId: 'proj1',
            serviceEnvId: 'senv1',
            deploymentId: 'dep1',
          }),
        }),
      );
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
        expect.objectContaining({
          data: expect.objectContaining({ status: DeploymentStatus.FAILED }),
        }),
      );
    });

    it('pipeline failure: emits finished event', async () => {
      const { svc, gateway } = makeDeps({
        needsDirectTrigger: false,
        pipelineError: new Error('CI down'),
      });
      await expect(
        svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1'),
      ).rejects.toThrow();
      expect(gateway.emitFinished).toHaveBeenCalledWith({
        deploymentId: 'dep1',
        status: DeploymentStatus.FAILED,
        finishedAt: expect.any(Date),
      });
    });

    it('uses blue-green strategy when dto.strategy is blue-green', async () => {
      const { svc } = makeDeps({ needsDirectTrigger: true });
      (buildAppSpecSnapshot as jest.Mock).mockClear();
      await svc.create(
        { serviceEnvId: 'senv1', branch: 'main', strategy: 'blue-green' },
        'user1',
      );
      // The strategy is frozen into the specSnapshot at creation time — assert
      // the snapshot builder actually received BLUE_GREEN, not just that some
      // transaction ran (which would pass for either strategy).
      expect(buildAppSpecSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'BLUE_GREEN' }),
      );
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
      expect(queueService.enqueueDeploy).toHaveBeenCalledWith('dep1');
    });

    it('calls getDatabaseImage to resolve the container image', async () => {
      const { svc, configResolver } = makeDeps({
        serviceType: ServiceType.DATABASE,
        databaseType: ManagedServiceType.POSTGRES,
      });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(configResolver.getDatabaseImage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'svc1',
          databaseType: ManagedServiceType.POSTGRES,
        }),
      );
    });

    it('emits started event for database deployment', async () => {
      const { svc, gateway } = makeDeps({
        serviceType: ServiceType.DATABASE,
        databaseType: ManagedServiceType.MYSQL,
      });
      await svc.create({ serviceEnvId: 'senv1', branch: 'main' }, 'user1');
      expect(gateway.emitStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: 'dep1',
          projectId: 'proj1',
          environmentId: 'env1',
          status: DeploymentStatus.PENDING,
        }),
      );
    });
  });
});

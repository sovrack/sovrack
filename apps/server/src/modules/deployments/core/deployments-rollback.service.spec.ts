import { BadRequestException } from '@nestjs/common';
import { DeploymentStatus, DeploymentStrategy, Role } from '@prisma/client';
import { DeploymentsRollbackService } from './deployments-rollback.service';

const baseDeployment = {
  id: 'dep1',
  projectId: 'proj1',
  environmentId: 'env1',
  serviceId: 'svc1',
  serviceEnvId: 'senv1',
  status: DeploymentStatus.SUCCESS,
  branch: 'main',
  strategy: DeploymentStrategy.STANDARD,
  buildId: 'build1',
  dockerImage: 'registry/app:v1',
  imageSha: null,
  isRollback: false,
  specSnapshot: null,
  // C1: resolveTargetServerId reads this first (same field ReconcilerService
  // uses for auto-heal) to feed DeploymentPreflightService.assertServerReady.
  resolvedRefs: { serverId: 'srv-1' },
  observedGeneration: 1,
  startedAt: new Date(),
  finishedAt: new Date(),
};

function makeSvc(
  opts: {
    currentDeployment?: Partial<typeof baseDeployment>;
    previousSuccess?: Partial<typeof baseDeployment> | null;
    previousHasDockerImage?: boolean;
  } = {},
) {
  const current = { ...baseDeployment, ...opts.currentDeployment };
  const previous =
    opts.previousSuccess === null
      ? null
      : opts.previousSuccess !== undefined
        ? { ...baseDeployment, ...opts.previousSuccess }
        : {
            ...baseDeployment,
            id: 'dep0',
            dockerImage:
              opts.previousHasDockerImage !== false ? 'registry/app:v0' : null,
          };

  const created = {
    ...baseDeployment,
    id: 'dep-rollback',
    status: DeploymentStatus.PENDING,
    isRollback: true,
  };

  const prisma = {
    deployment: {
      findFirst: jest.fn().mockResolvedValue(previous),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue({}),
    },
    project: {
      findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1' }),
    },
  } as never;

  const authorizationService = {
    getActor: jest.fn().mockResolvedValue({ id: 'user1', role: Role.OWNER }),
    assertCanRollbackProject: jest.fn().mockResolvedValue(undefined),
  } as never;

  const queryService = {
    findOne: jest.fn().mockResolvedValue(current),
  } as never;

  const gateway = {
    emitStatus: jest.fn(),
  } as never;

  const queueService = {
    enqueueDeploy: jest.fn().mockResolvedValue('job-1'),
  } as never;

  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as never;

  const preflight = {
    assertServerReady: jest.fn().mockResolvedValue(undefined),
  } as never;

  return {
    svc: new DeploymentsRollbackService(
      prisma,
      authorizationService,
      queryService,
      gateway,
      queueService,
      auditService,
      preflight,
    ),
    prisma,
    authorizationService,
    queryService,
    gateway,
    queueService,
    auditService,
    preflight,
  };
}

describe('DeploymentsRollbackService', () => {
  describe('rollback', () => {
    it('throws BadRequestException when no previous SUCCESS deployment exists', async () => {
      const { svc } = makeSvc({ previousSuccess: null });
      await expect(svc.rollback('dep1', 'user1', Role.OWNER)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when target deployment has no dockerImage', async () => {
      const { svc } = makeSvc({ previousHasDockerImage: false });
      await expect(svc.rollback('dep1', 'user1', Role.OWNER)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a rollback deployment with isRollback=true', async () => {
      const { svc, prisma } = makeSvc();
      await svc.rollback('dep1', 'user1', Role.OWNER);
      expect(prisma.deployment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isRollback: true }),
        }),
      );
    });

    it('creates rollback with previousDeploymentId pointing to the source', async () => {
      const { svc, prisma } = makeSvc();
      await svc.rollback('dep1', 'user1', Role.OWNER);
      expect(prisma.deployment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ previousDeploymentId: 'dep0' }),
        }),
      );
    });

    it('enqueues the immutable rollback image', async () => {
      const { svc, queueService } = makeSvc();
      await svc.rollback('dep1', 'user1', Role.OWNER);
      expect(queueService.enqueueDeploy).toHaveBeenCalledWith(
        'dep-rollback',
        'team-1',
        'registry/app:v0',
      );
    });

    it('prefers imageSha over dockerImage when sha is present', async () => {
      const { svc, queueService } = makeSvc({
        previousSuccess: {
          ...baseDeployment,
          id: 'dep0',
          dockerImage: 'registry/app:v0',
          imageSha: 'sha256:abc',
        },
      });
      await svc.rollback('dep1', 'user1', Role.OWNER);
      expect(queueService.enqueueDeploy).toHaveBeenCalledWith(
        'dep-rollback',
        'team-1',
        'sha256:abc',
      );
    });

    it('emits the pending gateway status', async () => {
      const { svc, gateway } = makeSvc();
      await svc.rollback('dep1', 'user1', Role.OWNER);
      expect(gateway.emitStatus).toHaveBeenCalledWith({
        deploymentId: 'dep-rollback',
        status: DeploymentStatus.PENDING,
      });
    });

    it('records DEPLOYMENT_ROLLBACK audit', async () => {
      const { svc, auditService } = makeSvc();
      await svc.rollback('dep1', 'user1', Role.OWNER);
      expect(auditService.record).toHaveBeenCalledWith(
        'user1',
        'DEPLOYMENT_ROLLBACK',
        'Deployment',
        'dep-rollback',
        expect.any(Object),
      );
    });

    it('queries by targetDeploymentId when explicitly provided', async () => {
      const { svc, prisma } = makeSvc();
      await svc.rollback('dep1', 'user1', Role.OWNER, 'dep-target');
      const query = (prisma.deployment.findFirst as jest.Mock).mock.calls[0][0];
      expect(query.where.id).toBe('dep-target');
    });

    it('throws when targetDeploymentId not found', async () => {
      const { svc } = makeSvc({ previousSuccess: null });
      await expect(
        svc.rollback('dep1', 'user1', Role.OWNER, 'dep-target'),
      ).rejects.toThrow('introuvable');
    });

    // C1 (Sprints 4+5+6 mission): minimal server guard before relaunching a
    // known-working image.
    it('asserts server readiness for the resolved target server before redeploying', async () => {
      const { svc, preflight, queueService } = makeSvc();
      await svc.rollback('dep1', 'user1', Role.OWNER);
      expect(preflight.assertServerReady).toHaveBeenCalledWith('srv-1');
      expect(queueService.enqueueDeploy).toHaveBeenCalled();
    });

    it('does not create a rollback deployment when the target server is not ready', async () => {
      const { svc, prisma, preflight } = makeSvc();
      (preflight.assertServerReady as jest.Mock).mockRejectedValue(
        new BadRequestException('Le serveur « srv-1 » est désactivé.'),
      );
      await expect(svc.rollback('dep1', 'user1', Role.OWNER)).rejects.toThrow(
        /désactivé/,
      );
      expect(prisma.deployment.create).not.toHaveBeenCalled();
    });
  });
});

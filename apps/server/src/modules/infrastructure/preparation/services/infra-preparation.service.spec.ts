import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ServerJobStatus,
  ServerRunKind,
  ServerRunStatus,
  ServerStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersAuditService } from '../../servers/services/servers-audit.service';
import { ServerVerificationService } from '../../servers/services/server-verification.service';
import { ServersJobsService } from '../../servers/services/servers-jobs.service';
import { ServerPreparationGateway } from '../gateways/server-preparation.gateway';
import { ServerRunsService } from '../../server-runs/server-runs.service';
import { ServerPreparationStateService } from './preparation/server-preparation-state.service';
import { InfraPreparationRunnerService } from './infra-preparation-runner.service';
import { ServerPreparationService } from './infra-preparation.service';

const defaultServer = {
  id: 'srv1',
  isActive: true,
  isVerified: true,
  status: ServerStatus.ACTIVE,
};

const defaultValidation = {
  sshReachable: true,
  authSucceeded: true,
  sudoAvailable: true,
  validatedAt: new Date(),
};

function makeSvc(opts: {
  server?: unknown;
  orphans?: unknown[];
  activePreparationCount?: number;
  validation?: unknown;
  preparation?: unknown;
  preparations?: unknown[];
  serverJob?: unknown;
} = {}) {
  const prisma = {
    serverRun: {
      findMany: jest.fn().mockResolvedValue(opts.orphans ?? []),
      count: jest.fn().mockResolvedValue(opts.activePreparationCount ?? 0),
      findFirst: jest.fn().mockResolvedValue(
        'preparation' in opts
          ? opts.preparation
          : {
              id: 'prep1',
              serverId: 'srv1',
              status: ServerRunStatus.RUNNING,
              steps: [],
              resolvedRolesJson: ['docker'],
              selectedOptionsJson: {},
              profile: 'BASIC',
            },
      ),
    },
    serverJob: {
      findFirst: jest.fn().mockResolvedValue(
        'serverJob' in opts ? opts.serverJob : null,
      ),
      update: jest.fn().mockResolvedValue({}),
      createJob: jest.fn().mockResolvedValue({ id: 'job1' }),
    },
    server: {
      findUnique: jest.fn().mockResolvedValue(
        'server' in opts ? opts.server : defaultServer,
      ),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;

  const jobs = {
    createJob: jest.fn().mockResolvedValue({ id: 'job1' }),
  } as unknown as ServersJobsService;

  const verification = {
    latestValidationResult: jest.fn().mockResolvedValue(
      'validation' in opts ? opts.validation : defaultValidation,
    ),
  } as unknown as ServerVerificationService;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as ServersAuditService;

  const gateway = {
    emitFinished: jest.fn(),
  } as unknown as ServerPreparationGateway;

  const state = {
    transitionPreparation: jest.fn().mockResolvedValue({}),
  } as unknown as ServerPreparationStateService;

  const serverRuns = {
    getLogs: jest.fn().mockResolvedValue([]),
  } as unknown as ServerRunsService;

  const runner = {
    createRun: jest.fn().mockResolvedValue({ id: 'run1' }),
    runInBackground: jest.fn(),
    abort: jest.fn(),
    knownRoleKeys: new Set(['docker', 'nginx', 'system_base']),
  } as unknown as InfraPreparationRunnerService;

  const svc = new ServerPreparationService(
    prisma,
    jobs,
    verification,
    audit,
    gateway,
    state,
    serverRuns,
    runner,
  );
  return { svc, prisma, jobs, verification, audit, gateway, state, runner };
}

// Minimal toPreparationView-compatible run shape
const minRun = (status: ServerRunStatus = ServerRunStatus.RUNNING) => ({
  id: 'prep1',
  serverId: 'srv1',
  status,
  steps: [],
  resolvedRolesJson: ['docker'],
  selectedOptionsJson: { docker: true },
  profile: 'BASIC',
  createdAt: new Date(),
  updatedAt: new Date(),
  finishedAt: null,
  summary: null,
  errorMessage: null,
  kind: ServerRunKind.PREPARATION,
  retryOfRunId: null,
});

describe('ServerPreparationService', () => {
  describe('onModuleInit', () => {
    it('does nothing when there are no orphaned preparations', async () => {
      const { svc, state } = makeSvc({ orphans: [] });
      await svc.onModuleInit();
      expect(state.transitionPreparation).not.toHaveBeenCalled();
    });

    it('marks orphaned preparations as FAILED on startup', async () => {
      const { svc, state } = makeSvc({
        orphans: [{ id: 'prep-orphan', serverId: 'srv1' }],
      });
      await svc.onModuleInit();
      expect(state.transitionPreparation).toHaveBeenCalledWith(
        'prep-orphan',
        ServerRunStatus.FAILED,
        expect.any(Object),
      );
    });

    it('continues processing remaining orphans even if one fails', async () => {
      const { svc, state } = makeSvc({
        orphans: [
          { id: 'p1', serverId: 'srv1' },
          { id: 'p2', serverId: 'srv2' },
        ],
      });
      (state.transitionPreparation as jest.Mock)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({});
      await expect(svc.onModuleInit()).resolves.toBeUndefined();
      expect(state.transitionPreparation).toHaveBeenCalledTimes(2);
    });
  });

  describe('getOptions', () => {
    it('returns profiles and options without I/O', () => {
      const { svc } = makeSvc();
      const opts = svc.getOptions();
      expect(opts.profiles).toContain('FULL');
      expect(opts.options).toBeDefined();
      expect(opts.profileDefaults).toBeDefined();
    });
  });

  describe('getPreparationReadiness', () => {
    it('throws NotFoundException when server not found', async () => {
      const { svc } = makeSvc({ server: null });
      await expect(svc.getPreparationReadiness('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns isReady=true when all checks pass', async () => {
      const { svc } = makeSvc();
      const result = await svc.getPreparationReadiness('srv1');
      expect(result.isReady).toBe(true);
      expect(result.blockingReasons).toHaveLength(0);
    });

    it('returns isReady=false when server is not verified', async () => {
      const { svc } = makeSvc({
        server: { ...defaultServer, isVerified: false },
      });
      const result = await svc.getPreparationReadiness('srv1');
      expect(result.isReady).toBe(false);
      expect(result.blockingReasons.length).toBeGreaterThan(0);
    });

    it('returns isReady=false when a preparation is already running', async () => {
      const { svc } = makeSvc({ activePreparationCount: 1 });
      const result = await svc.getPreparationReadiness('srv1');
      expect(result.isReady).toBe(false);
    });
  });

  describe('getPreparation', () => {
    it('throws NotFoundException when preparation not found', async () => {
      const { svc } = makeSvc({ preparation: null });
      await expect(svc.getPreparation('ghost')).rejects.toThrow(NotFoundException);
    });

    it('returns preparation view when found', async () => {
      const { svc, prisma } = makeSvc();
      (prisma.serverRun.findFirst as jest.Mock).mockResolvedValue(minRun());
      const result = await svc.getPreparation('prep1');
      expect(result.id).toBe('prep1');
    });
  });

  describe('listPreparations', () => {
    it('throws NotFoundException when server not found', async () => {
      const { svc } = makeSvc({ server: null });
      await expect(svc.listPreparations('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns empty list when no preparations exist', async () => {
      const { svc } = makeSvc({ preparations: [] });
      (svc as unknown as { prisma: { serverRun: { findMany: jest.Mock } } })
        .prisma.serverRun.findMany
        // second call (listPreparations) returns empty
        .mockResolvedValueOnce([]) // onModuleInit orphans check
        .mockResolvedValueOnce([]); // listPreparations
      // Re-create without orphans first to avoid confusion
      const { svc: svc2, prisma } = makeSvc({ orphans: [] });
      (prisma.serverRun.findMany as jest.Mock).mockResolvedValue([]);
      const result = await svc2.listPreparations('srv1');
      expect(result).toHaveLength(0);
    });
  });

  describe('cancelPreparation', () => {
    it('throws NotFoundException when preparation has no serverId', async () => {
      const { svc, prisma } = makeSvc();
      (prisma.serverRun.findFirst as jest.Mock).mockResolvedValue({
        ...minRun(),
        serverId: null,
      });
      await expect(svc.cancelPreparation('prep1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when preparation is not in an active status', async () => {
      const { svc, prisma } = makeSvc();
      (prisma.serverRun.findFirst as jest.Mock).mockResolvedValue(
        minRun(ServerRunStatus.SUCCEEDED),
      );
      await expect(svc.cancelPreparation('prep1')).rejects.toThrow(BadRequestException);
    });

    it('aborts the runner and transitions to CANCELED', async () => {
      const { svc, prisma, state, runner, gateway } = makeSvc();
      (prisma.serverRun.findFirst as jest.Mock)
        .mockResolvedValueOnce(minRun(ServerRunStatus.RUNNING))  // getPreparation first call
        .mockResolvedValueOnce(minRun(ServerRunStatus.CANCELED)); // getPreparation second call (updated)
      await svc.cancelPreparation('prep1');
      expect(runner.abort).toHaveBeenCalledWith('prep1');
      expect(state.transitionPreparation).toHaveBeenCalledWith(
        'prep1',
        ServerRunStatus.CANCELED,
        expect.any(Object),
      );
      expect(gateway.emitFinished).toHaveBeenCalled();
    });

    it('cancels the active server job when one exists', async () => {
      const { svc, prisma, state } = makeSvc({
        serverJob: { id: 'job1' },
      });
      (prisma.serverRun.findFirst as jest.Mock)
        .mockResolvedValueOnce(minRun(ServerRunStatus.RUNNING))
        .mockResolvedValueOnce(minRun(ServerRunStatus.CANCELED));
      await svc.cancelPreparation('prep1');
      expect(prisma.serverJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job1' },
          data: expect.objectContaining({ status: ServerJobStatus.FAILED }),
        }),
      );
    });
  });

  describe('startPreparation', () => {
    it('throws BadRequestException when no roles are resolved', async () => {
      const { svc, prisma } = makeSvc();
      // All checkboxes false → resolvePreparationOptions returns empty roles
      await expect(
        svc.startPreparation('srv1', {
          profile: 'CUSTOM',
          docker: false,
          systemUpdate: false,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles P2002 job conflict by transitioning run to FAILED and throwing ConflictException', async () => {
      const { svc, jobs, state, prisma } = makeSvc();
      // Make runner.createRun return a run
      // startPreparation needs server to be ready → patch verification
      (prisma.serverRun.count as jest.Mock).mockResolvedValue(0);
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (jobs.createJob as jest.Mock).mockRejectedValue(p2002);
      await expect(
        svc.startPreparation('srv1', { profile: 'BASIC', docker: true } as never),
      ).rejects.toMatchObject({ message: expect.stringContaining('déjà en cours') });
      expect(state.transitionPreparation).toHaveBeenCalledWith(
        'run1',
        ServerRunStatus.FAILED,
        expect.any(Object),
      );
    });
  });
});

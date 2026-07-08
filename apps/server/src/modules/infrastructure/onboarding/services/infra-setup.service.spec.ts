import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ServerJobStatus,
  ServerRunKind,
  ServerRunStatus,
  ServerStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersAuditService } from '../../servers/services/servers-audit.service';
import { ServersVerificationService } from '../../servers/services/servers-verification.service';
import { ServersJobsService } from '../../servers/services/servers-jobs.service';
import { ServerSetupGateway } from '../gateways/server-setup.gateway';
import { ServerRunsService } from '../../server-runs/server-runs.service';
import { ServerSetupStateService } from './setup/server-setup-state.service';
import { InfraSetupRunnerService } from './infra-setup-runner.service';
import { ServerSetupService } from './infra-setup.service';

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

function makeSvc(
  opts: {
    server?: unknown;
    orphans?: unknown[];
    activeSetupCount?: number;
    validation?: unknown;
    setup?: unknown;
    setups?: unknown[];
    serverJob?: unknown;
  } = {},
) {
  const prisma = {
    serverRun: {
      findMany: jest.fn().mockResolvedValue(opts.orphans ?? []),
      count: jest.fn().mockResolvedValue(opts.activeSetupCount ?? 0),
      findFirst: jest.fn().mockResolvedValue(
        'setup' in opts
          ? opts.setup
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
      findFirst: jest
        .fn()
        .mockResolvedValue('serverJob' in opts ? opts.serverJob : null),
      update: jest.fn().mockResolvedValue({}),
      createJob: jest.fn().mockResolvedValue({ id: 'job1' }),
    },
    server: {
      findUnique: jest
        .fn()
        .mockResolvedValue('server' in opts ? opts.server : defaultServer),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;

  const jobs = {
    createJob: jest.fn().mockResolvedValue({ id: 'job1' }),
  } as unknown as ServersJobsService;

  const verification = {
    latestValidationResult: jest
      .fn()
      .mockResolvedValue(
        'validation' in opts ? opts.validation : defaultValidation,
      ),
  } as unknown as ServersVerificationService;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as ServersAuditService;

  const gateway = {
    emitFinished: jest.fn(),
  } as unknown as ServerSetupGateway;

  const state = {
    transitionSetup: jest.fn().mockResolvedValue({}),
  } as unknown as ServerSetupStateService;

  const serverRuns = {
    getLogs: jest.fn().mockResolvedValue([]),
  } as unknown as ServerRunsService;

  const runner = {
    createRun: jest.fn().mockResolvedValue({ id: 'run1' }),
    runInBackground: jest.fn(),
    runSetupJob: jest.fn(),
    abort: jest.fn(),
    knownRoleKeys: new Set(['docker', 'nginx', 'system_base']),
  } as unknown as InfraSetupRunnerService;

  const queue = {
    enqueueSetup: jest.fn().mockResolvedValue('job-1'),
  } as unknown as import('../../../../shared/queue/queue.service').QueueService;

  const abortBridge = {
    requestAbort: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('./setup-abort.bridge').SetupAbortBridge;

  const svc = new ServerSetupService(
    prisma,
    jobs,
    verification,
    audit,
    gateway,
    state,
    serverRuns,
    runner,
    queue,
    abortBridge,
  );
  return {
    svc,
    prisma,
    jobs,
    verification,
    audit,
    gateway,
    state,
    runner,
    queue,
    abortBridge,
  };
}

// Minimal toSetupView-compatible run shape
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

describe('ServerSetupService', () => {
  describe('onModuleInit', () => {
    it('does nothing when there are no orphaned setups', async () => {
      const { svc, state } = makeSvc({ orphans: [] });
      await svc.onModuleInit();
      expect(state.transitionSetup).not.toHaveBeenCalled();
    });

    it('marks orphaned setups as FAILED on startup', async () => {
      const { svc, state } = makeSvc({
        orphans: [{ id: 'prep-orphan', serverId: 'srv1' }],
      });
      await svc.onModuleInit();
      expect(state.transitionSetup).toHaveBeenCalledWith(
        'prep-orphan',
        ServerRunStatus.FAILED,
        expect.any(Object),
      );
    });

    it('skips recovery entirely in the API-only role (worker owns it)', async () => {
      const previous = process.env.PROCESS_ROLE;
      process.env.PROCESS_ROLE = 'api';
      try {
        const { svc, state, prisma } = makeSvc({
          orphans: [{ id: 'prep-orphan', serverId: 'srv1' }],
        });
        await svc.onModuleInit();
        expect(prisma.serverRun.findMany).not.toHaveBeenCalled();
        expect(state.transitionSetup).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) delete process.env.PROCESS_ROLE;
        else process.env.PROCESS_ROLE = previous;
      }
    });

    it('continues processing remaining orphans even if one fails', async () => {
      const { svc, state } = makeSvc({
        orphans: [
          { id: 'p1', serverId: 'srv1' },
          { id: 'p2', serverId: 'srv2' },
        ],
      });
      (state.transitionSetup as jest.Mock)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({});
      await expect(svc.onModuleInit()).resolves.toBeUndefined();
      expect(state.transitionSetup).toHaveBeenCalledTimes(2);
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

  describe('getSetupReadiness', () => {
    it('throws NotFoundException when server not found', async () => {
      const { svc } = makeSvc({ server: null });
      await expect(svc.getSetupReadiness('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns isReady=true when all checks pass', async () => {
      const { svc } = makeSvc();
      const result = await svc.getSetupReadiness('srv1');
      expect(result.isReady).toBe(true);
      expect(result.blockingReasons).toHaveLength(0);
    });

    it('returns isReady=false when server is not verified', async () => {
      const { svc } = makeSvc({
        server: { ...defaultServer, isVerified: false },
      });
      const result = await svc.getSetupReadiness('srv1');
      expect(result.isReady).toBe(false);
      expect(result.blockingReasons.length).toBeGreaterThan(0);
    });

    it('returns isReady=false when a setup is already running', async () => {
      const { svc } = makeSvc({ activeSetupCount: 1 });
      const result = await svc.getSetupReadiness('srv1');
      expect(result.isReady).toBe(false);
    });
  });

  describe('getSetup', () => {
    it('throws NotFoundException when setup not found', async () => {
      const { svc } = makeSvc({ setup: null });
      await expect(svc.getSetup('ghost')).rejects.toThrow(NotFoundException);
    });

    it('returns setup view when found', async () => {
      const { svc, prisma } = makeSvc();
      (prisma.serverRun.findFirst as jest.Mock).mockResolvedValue(minRun());
      const result = await svc.getSetup('prep1');
      expect(result.id).toBe('prep1');
    });
  });

  describe('listSetups', () => {
    it('throws NotFoundException when server not found', async () => {
      const { svc } = makeSvc({ server: null });
      await expect(svc.listSetups('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns empty list when no setups exist', async () => {
      const { svc } = makeSvc({ setups: [] });
      (
        svc as unknown as { prisma: { serverRun: { findMany: jest.Mock } } }
      ).prisma.serverRun.findMany
        // second call (listSetups) returns empty
        .mockResolvedValueOnce([]) // onModuleInit orphans check
        .mockResolvedValueOnce([]); // listSetups
      // Re-create without orphans first to avoid confusion
      const { svc: svc2, prisma } = makeSvc({ orphans: [] });
      (prisma.serverRun.findMany as jest.Mock).mockResolvedValue([]);
      const result = await svc2.listSetups('srv1');
      expect(result).toHaveLength(0);
    });
  });

  describe('cancelSetup', () => {
    it('throws NotFoundException when setup has no serverId', async () => {
      const { svc, prisma } = makeSvc();
      (prisma.serverRun.findFirst as jest.Mock).mockResolvedValue({
        ...minRun(),
        serverId: null,
      });
      await expect(svc.cancelSetup('prep1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when setup is not in an active status', async () => {
      const { svc, prisma } = makeSvc();
      (prisma.serverRun.findFirst as jest.Mock).mockResolvedValue(
        minRun(ServerRunStatus.SUCCEEDED),
      );
      await expect(svc.cancelSetup('prep1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('aborts the run (via the cross-process bridge) and transitions to CANCELED', async () => {
      const { svc, prisma, state, abortBridge, gateway } = makeSvc();
      (prisma.serverRun.findFirst as jest.Mock)
        .mockResolvedValueOnce(minRun(ServerRunStatus.RUNNING)) // getSetup first call
        .mockResolvedValueOnce(minRun(ServerRunStatus.CANCELED)); // getSetup second call (updated)
      await svc.cancelSetup('prep1');
      expect(abortBridge.requestAbort).toHaveBeenCalledWith('prep1');
      expect(state.transitionSetup).toHaveBeenCalledWith(
        'prep1',
        ServerRunStatus.CANCELED,
        expect.any(Object),
      );
      expect(gateway.emitFinished).toHaveBeenCalled();
    });

    it('cancels the active server job when one exists', async () => {
      const { svc, prisma } = makeSvc({
        serverJob: { id: 'job1' },
      });
      (prisma.serverRun.findFirst as jest.Mock)
        .mockResolvedValueOnce(minRun(ServerRunStatus.RUNNING))
        .mockResolvedValueOnce(minRun(ServerRunStatus.CANCELED));
      await svc.cancelSetup('prep1');
      expect(prisma.serverJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job1' },
          data: expect.objectContaining({ status: ServerJobStatus.FAILED }),
        }),
      );
    });
  });

  describe('startSetup', () => {
    it('throws BadRequestException when no roles are resolved', async () => {
      const { svc } = makeSvc();
      // All checkboxes false → resolveSetupOptions returns empty roles
      await expect(
        svc.startSetup('srv1', {
          profile: 'CUSTOM',
          docker: false,
          systemUpdate: false,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles P2002 job conflict by transitioning run to FAILED and throwing ConflictException', async () => {
      const { svc, jobs, state, prisma } = makeSvc();
      // Make runner.createRun return a run
      // startSetup needs server to be ready → patch verification
      (prisma.serverRun.count as jest.Mock).mockResolvedValue(0);
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (jobs.createJob as jest.Mock).mockRejectedValue(p2002);
      await expect(
        svc.startSetup('srv1', {
          profile: 'BASIC',
          docker: true,
        } as never),
      ).rejects.toMatchObject({
        message: expect.stringContaining('déjà en cours'),
      });
      expect(state.transitionSetup).toHaveBeenCalledWith(
        'run1',
        ServerRunStatus.FAILED,
        expect.any(Object),
      );
    });
  });
});

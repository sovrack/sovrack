import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Prisma,
  Server,
  ServerJobStatus,
  ServerLogLevel,
  ServerRunStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersJobsService } from '../../servers/services/servers-jobs.service';
import { ServersConnectionService } from '../../servers/services/servers-connection.service';
import { ServerSetupAnsibleService } from './server-setup-ansible.service';
import { ServerSetupGateway } from '../gateways/server-setup.gateway';
import { ServerSetupStateService } from './setup/server-setup-state.service';
import { ServerRunsService } from '../../server-runs/server-runs.service';
import { InfraSetupRunnerService } from './infra-setup-runner.service';
import { SetupPostProcessorService } from './setup-post-processor.service';
import type {
  SetupRoleKey,
  ResolvedSetup,
} from '../../servers/shared/server-setup-options';

describe('InfraSetupRunnerService', () => {
  function build() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      serverRun: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'run-1', steps: [] }),
      },
      serverJob: { count: jest.fn().mockResolvedValue(0) },
      server: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) =>
          cb(tx),
        ),
      serverRun: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: ServerRunStatus.RUNNING }),
      },
      serverRunStep: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      serverJob: { update: jest.fn().mockResolvedValue({}) },
      server: {
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'srv-1' }),
      },
    } as unknown as PrismaService;
    const jobs = {} as unknown as ServersJobsService;
    const ssh = {} as unknown as ServersConnectionService;
    const ansible = {} as unknown as ServerSetupAnsibleService;
    const gateway = {
      emitLog: jest.fn(),
      emitFinished: jest.fn(),
    } as unknown as ServerSetupGateway;
    const config = {
      get: jest.fn().mockReturnValue('0'),
    } as unknown as ConfigService;
    const state = {
      transitionSetup: jest.fn().mockResolvedValue(undefined),
      markFailedRunningTasks: jest.fn().mockResolvedValue(undefined),
      markAllRemainingTasks: jest.fn().mockResolvedValue(undefined),
    } as unknown as ServerSetupStateService;
    const serverRuns = {
      appendLog: jest.fn().mockResolvedValue({
        runId: 'run-1',
        level: ServerLogLevel.INFO,
        source: 'orchestrator',
        message: 'hello',
        lineNumber: 1,
        createdAt: new Date(),
      }),
    } as unknown as ServerRunsService;
    const postProcessor = {
      registerDockerTlsConnection: jest.fn().mockResolvedValue(undefined),
      refreshDetectionAfterSetup: jest.fn().mockResolvedValue(undefined),
    } as unknown as SetupPostProcessorService;

    const runner = new InfraSetupRunnerService(
      prisma,
      jobs,
      ssh,
      ansible,
      gateway,
      config,
      state,
      serverRuns,
      postProcessor,
    );
    return {
      runner,
      prisma,
      tx,
      gateway,
      state,
      serverRuns,
      config,
      postProcessor,
    };
  }

  const server = { id: 'srv-1' } as Server;
  const resolved: ResolvedSetup = {
    profile: 'BASIC',
    selectedOptions: { docker: true } as never,
    roles: ['system_base'] as SetupRoleKey[],
    gitlabRunnerExecutor: 'docker',
    reinstallOptions: new Set<string>(),
    warnings: [],
  } as ResolvedSetup;
  const roles = ['system_base'] as SetupRoleKey[];

  describe('createRun', () => {
    it('creates the run + steps and flips the server to PREPARATION_PENDING', async () => {
      const { runner, tx } = build();
      const created = await runner.createRun(
        server,
        resolved,
        roles,
        undefined,
        'user-1',
      );
      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(tx.serverRun.create).toHaveBeenCalled();
      expect(tx.server.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'srv-1' } }),
      );
      expect(created).toMatchObject({ id: 'run-1' });
    });

    it('rejects when a setup is already active', async () => {
      const { runner, tx } = build();
      tx.serverRun.count.mockResolvedValueOnce(1);
      await expect(
        runner.createRun(server, resolved, roles),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects with Conflict when another job is running', async () => {
      const { runner, tx } = build();
      tx.serverJob.count.mockResolvedValueOnce(1);
      await expect(
        runner.createRun(server, resolved, roles),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps a P2002 unique violation to a BadRequest', async () => {
      const { runner, prisma } = build();
      (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5',
        }),
      );
      await expect(
        runner.createRun(server, resolved, roles),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rethrows unknown transaction errors unchanged', async () => {
      const { runner, prisma } = build();
      (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
        new Error('db down'),
      );
      await expect(runner.createRun(server, resolved, roles)).rejects.toThrow(
        'db down',
      );
    });
  });

  describe('abort', () => {
    it('is a no-op when no setup is running', () => {
      const { runner } = build();
      expect(() => runner.abort('unknown')).not.toThrow();
    });
  });

  describe('knownRoleKeys', () => {
    it('exposes the canonical role set', () => {
      const { runner } = build();
      expect(runner.knownRoleKeys.has('system_base' as SetupRoleKey)).toBe(
        true,
      );
    });
  });

  describe('handleSetupFailure', () => {
    const call = (
      r: InfraSetupRunnerService,
      ...args: unknown[]
    ): Promise<void> =>
      (
        r as unknown as {
          handleSetupFailure: (...a: unknown[]) => Promise<void>;
        }
      ).handleSetupFailure(...args);

    it('only fails the job when the setup was canceled', async () => {
      const { runner, prisma, state } = build();
      (prisma.serverRun.findUnique as jest.Mock).mockResolvedValueOnce({
        status: ServerRunStatus.CANCELED,
      });
      await call(runner, 'srv-1', 'run-1', 'job-1', new Error('boom'));
      expect(prisma.serverJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ServerJobStatus.FAILED }),
        }),
      );
      expect(state.transitionSetup).not.toHaveBeenCalled();
    });

    it('marks failed tasks and transitions the run on a real failure', async () => {
      const { runner, state, gateway } = build();
      await call(
        runner,
        'srv-1',
        'run-1',
        'job-1',
        new Error('ansible exploded'),
      );
      expect(state.markFailedRunningTasks).toHaveBeenCalledWith('run-1', false);
      expect(state.transitionSetup).toHaveBeenCalled();
      expect(gateway.emitFinished).toHaveBeenCalled();
    });

    it('detects a timeout failure from the JOB_TIMEOUT_ prefix', async () => {
      const { runner, state, prisma } = build();
      await call(
        runner,
        'srv-1',
        'run-1',
        'job-1',
        new Error('JOB_TIMEOUT_5000'),
      );
      expect(state.markFailedRunningTasks).toHaveBeenCalledWith('run-1', true);
      expect(prisma.serverJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ServerJobStatus.TIMEOUT }),
        }),
      );
    });
  });

  describe('appendLog', () => {
    const call = (
      r: InfraSetupRunnerService,
      ...args: unknown[]
    ): Promise<void> =>
      (
        r as unknown as { appendLog: (...a: unknown[]) => Promise<void> }
      ).appendLog(...args);

    it('persists the log and emits it over the gateway', async () => {
      const { runner, serverRuns, gateway } = build();
      await call(runner, 'run-1', ServerLogLevel.INFO, 'orchestrator', 'hello');
      expect(serverRuns.appendLog).toHaveBeenCalled();
      expect(gateway.emitLog).toHaveBeenCalledWith(
        expect.objectContaining({ setupId: 'run-1' }),
      );
    });
  });
});

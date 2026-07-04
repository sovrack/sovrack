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
import { ServersDetectionService } from '../../servers/services/servers-detection.service';
import { ServersAuditService } from '../../servers/services/servers-audit.service';
import { ServerPreparationAnsibleService } from './server-preparation-ansible.service';
import { ServerPreparationGateway } from '../gateways/server-preparation.gateway';
import { ServerPreparationStateService } from './preparation/server-preparation-state.service';
import { ServerRunsService } from '../../server-runs/server-runs.service';
import { InfraPreparationRunnerService } from './infra-preparation-runner.service';
import type {
  PreparationRoleKey,
  ResolvedPreparation,
} from '../../servers/shared/server-preparation-options';

describe('InfraPreparationRunnerService', () => {
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
    const ansible = {} as unknown as ServerPreparationAnsibleService;
    const detection = {
      detect: jest.fn().mockResolvedValue({}),
    } as unknown as ServersDetectionService;
    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as ServersAuditService;
    const dockerConnections = {
      upsert: jest.fn().mockResolvedValue({ id: 'conn-1' }),
      probeReachability: jest
        .fn()
        .mockResolvedValue({ isReachable: true, apiVersion: '1.47', latencyMs: 12 }),
    };
    const gateway = {
      emitLog: jest.fn(),
      emitFinished: jest.fn(),
    } as unknown as ServerPreparationGateway;
    const config = {
      get: jest.fn().mockReturnValue('0'),
    } as unknown as ConfigService;
    const state = {
      transitionPreparation: jest.fn().mockResolvedValue(undefined),
      markFailedRunningTasks: jest.fn().mockResolvedValue(undefined),
      markAllRemainingTasks: jest.fn().mockResolvedValue(undefined),
    } as unknown as ServerPreparationStateService;
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

    const runner = new InfraPreparationRunnerService(
      prisma,
      jobs,
      ssh,
      ansible,
      detection,
      audit,
      gateway,
      config,
      state,
      serverRuns,
      dockerConnections as never,
    );
    return {
      runner,
      prisma,
      tx,
      gateway,
      state,
      serverRuns,
      detection,
      config,
      audit,
      dockerConnections,
    };
  }

  const server = { id: 'srv-1' } as Server;
  const resolved: ResolvedPreparation = {
    profile: 'BASIC',
    selectedOptions: { docker: true } as never,
    roles: ['system_base'] as PreparationRoleKey[],
    gitlabRunnerExecutor: 'docker',
    reinstallOptions: new Set<string>(),
    warnings: [],
  } as ResolvedPreparation;
  const roles = ['system_base'] as PreparationRoleKey[];

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

    it('rejects when a preparation is already active', async () => {
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
    it('is a no-op when no preparation is running', () => {
      const { runner } = build();
      expect(() => runner.abort('unknown')).not.toThrow();
    });
  });

  describe('knownRoleKeys', () => {
    it('exposes the canonical role set', () => {
      const { runner } = build();
      expect(
        runner.knownRoleKeys.has('system_base' as PreparationRoleKey),
      ).toBe(true);
    });
  });

  describe('handlePreparationFailure', () => {
    const call = (
      r: InfraPreparationRunnerService,
      ...args: unknown[]
    ): Promise<void> =>
      (
        r as unknown as {
          handlePreparationFailure: (...a: unknown[]) => Promise<void>;
        }
      ).handlePreparationFailure(...args);

    it('only fails the job when the preparation was canceled', async () => {
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
      expect(state.transitionPreparation).not.toHaveBeenCalled();
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
      expect(state.transitionPreparation).toHaveBeenCalled();
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

  // Mission docker_tls (T2): after a successful run that included the
  // docker_tls role, the orchestrator registers the DockerConnection
  // automatically with the fetched client certs — same encrypted storage path
  // as a manual POST /servers/:id/docker-connection (upsert).
  describe('registerDockerTlsConnection', () => {
    const call = (
      r: InfraPreparationRunnerService,
      ...args: unknown[]
    ): Promise<void> =>
      (
        r as unknown as {
          registerDockerTlsConnection: (...a: unknown[]) => Promise<void>;
        }
      ).registerDockerTlsConnection(...args);

    const srv = { id: 'srv-1', host: '10.0.0.9' } as Server;
    const material = { ca: 'CA_PEM', cert: 'CERT_PEM', key: 'KEY_PEM' };

    it('upserts the connection on tcp://host:2376 with the fetched certs and probes it', async () => {
      const { runner, dockerConnections, audit } = build();
      await call(runner, srv, 'run-1', material);
      expect(dockerConnections.upsert).toHaveBeenCalledWith({
        serverId: 'srv-1',
        endpoint: 'tcp://10.0.0.9:2376',
        tlsCaCert: 'CA_PEM',
        tlsClientCert: 'CERT_PEM',
        tlsClientKey: 'KEY_PEM',
      });
      expect(dockerConnections.probeReachability).toHaveBeenCalledWith('srv-1');
      expect(audit.record).toHaveBeenCalledWith(
        'srv-1',
        'DOCKER_CONNECTION_AUTO_REGISTERED',
        null,
        expect.objectContaining({ endpoint: 'tcp://10.0.0.9:2376' }),
      );
    });

    it('logs an ERROR (no throw) when material is missing — manual endpoint remains the fallback', async () => {
      const { runner, dockerConnections, serverRuns } = build();
      await call(runner, srv, 'run-1', null);
      expect(dockerConnections.upsert).not.toHaveBeenCalled();
      expect(serverRuns.appendLog).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({
          level: ServerLogLevel.ERROR,
          message: expect.stringContaining('NOT registered'),
        }),
      );
    });

    it('does not fail the preparation when the upsert itself fails (logged as ERROR)', async () => {
      const { runner, dockerConnections, serverRuns } = build();
      dockerConnections.upsert.mockRejectedValueOnce(new Error('db down'));
      await expect(call(runner, srv, 'run-1', material)).resolves.toBeUndefined();
      expect(serverRuns.appendLog).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ level: ServerLogLevel.ERROR }),
      );
      expect(dockerConnections.probeReachability).not.toHaveBeenCalled();
    });

    it('keeps the registration even when the post-registration probe fails (WARNING only)', async () => {
      const { runner, dockerConnections, serverRuns } = build();
      dockerConnections.probeReachability.mockRejectedValueOnce(
        new Error('handshake refused'),
      );
      await call(runner, srv, 'run-1', material);
      expect(dockerConnections.upsert).toHaveBeenCalled();
      expect(serverRuns.appendLog).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ level: ServerLogLevel.WARNING }),
      );
    });

    it('never logs the PEM contents themselves', async () => {
      const { runner, serverRuns } = build();
      await call(runner, srv, 'run-1', material);
      const allMessages = (serverRuns.appendLog as jest.Mock).mock.calls
        .map((c: unknown[]) => (c[1] as { message: string }).message)
        .join('\n');
      expect(allMessages).not.toContain('CA_PEM');
      expect(allMessages).not.toContain('CERT_PEM');
      expect(allMessages).not.toContain('KEY_PEM');
    });
  });

  describe('updateRoleStateFromLog', () => {
    const call = (
      r: InfraPreparationRunnerService,
      ...args: unknown[]
    ): Promise<void> =>
      (
        r as unknown as {
          updateRoleStateFromLog: (...a: unknown[]) => Promise<void>;
        }
      ).updateRoleStateFromLog(...args);

    it('does nothing when the log line carries no recognised role', async () => {
      const { runner, prisma } = build();
      await call(runner, 'run-1', 'some unrelated log line');
      expect(prisma.serverRunStep.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('refreshDetectionAfterPreparation', () => {
    const call = (
      r: InfraPreparationRunnerService,
      ...args: unknown[]
    ): Promise<void> =>
      (
        r as unknown as {
          refreshDetectionAfterPreparation: (...a: unknown[]) => Promise<void>;
        }
      ).refreshDetectionAfterPreparation(...args);

    it('runs detection on the refreshed server', async () => {
      const { runner, detection } = build();
      await call(runner, server, 'run-1');
      expect(detection.detect).toHaveBeenCalled();
    });

    it('logs a warning (non-fatal) when detection fails', async () => {
      const { runner, detection, serverRuns } = build();
      (detection.detect as jest.Mock).mockRejectedValueOnce(
        new Error('detect failed'),
      );
      await call(runner, server, 'run-1');
      expect(serverRuns.appendLog).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ level: ServerLogLevel.WARNING }),
      );
    });
  });

  describe('appendLog', () => {
    const call = (
      r: InfraPreparationRunnerService,
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
        expect.objectContaining({ preparationId: 'run-1' }),
      );
    });
  });
});

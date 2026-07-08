import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, ServerJobStatus, ServerJobType } from '@prisma/client';
import { ServersJobsService } from './servers-jobs.service';

describe('ServersJobsService', () => {
  function createService() {
    // Transaction client handed to createJobAtomic's $transaction callback.
    const tx = {
      $executeRaw: jest.fn(),
      serverJob: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const prisma = {
      server: {
        findUnique: jest.fn(),
      },
      serverJob: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };

    const ssh = {
      withTimeout: jest.fn(),
    };

    const service = new ServersJobsService(
      prisma as never,
      ssh as never,
      { get: jest.fn() } as never,
    );

    return { service, prisma, ssh, tx };
  }

  describe('onModuleInit (startup zombie-recovery)', () => {
    it('recovers ghost jobs in the default single-process role', async () => {
      const { service, prisma } = createService();
      prisma.serverJob.findMany.mockResolvedValue([
        { id: 'ghost-1', serverId: 'srv-1' },
      ]);
      await service.onModuleInit();
      expect(prisma.serverJob.findMany).toHaveBeenCalled();
      expect(prisma.serverJob.updateMany).toHaveBeenCalled();
    });

    it('skips recovery in the API-only role (worker owns it)', async () => {
      const previous = process.env.PROCESS_ROLE;
      process.env.PROCESS_ROLE = 'api';
      try {
        const { service, prisma } = createService();
        await service.onModuleInit();
        expect(prisma.serverJob.findMany).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) delete process.env.PROCESS_ROLE;
        else process.env.PROCESS_ROLE = previous;
      }
    });
  });

  it('paginates server jobs at database level', async () => {
    const { service, prisma } = createService();
    prisma.server.findUnique.mockResolvedValue({ id: 'srv-1' });
    prisma.serverJob.findMany.mockResolvedValue([
      {
        id: 'job-21',
        serverId: 'srv-1',
        type: ServerJobType.VERIFY,
        status: ServerJobStatus.SUCCESS,
        payload: null,
        output: 'ok',
        error: null,
        attempts: 1,
        maxAttempts: 3,
        timeoutMs: 120000,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    prisma.serverJob.count.mockResolvedValue(31);

    const result = await service.listJobs('srv-1', { page: 2, limit: 10 });

    expect(prisma.serverJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serverId: 'srv-1' },
        skip: 10,
        take: 10,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        total: 31,
        page: 2,
        limit: 10,
        totalPages: 4,
      }),
    );
  });

  it('marks job as TIMEOUT when execution exceeds timeout', async () => {
    const { service, prisma, ssh } = createService();
    prisma.serverJob.count.mockResolvedValue(0);
    prisma.serverJob.update.mockResolvedValue({});

    ssh.withTimeout.mockImplementation(
      (
        _task: () => Promise<unknown>,
        _timeoutMs: number,
        onTimeout?: () => void,
      ) => {
        onTimeout?.();
        return Promise.reject(new Error('JOB_TIMEOUT_120000'));
      },
    );

    const job = {
      id: 'job-timeout',
      serverId: 'srv-1',
      type: ServerJobType.VERIFY,
      status: ServerJobStatus.PENDING,
      payload: null,
      output: null,
      error: null,
      attempts: 0,
      maxAttempts: 1,
      timeoutMs: 120000,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(
      service.executeJobWithRetry(
        job,
        () => Promise.resolve('ok'),
        () => 'timeout',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const updateCalls = prisma.serverJob.update.mock.calls as Array<
      [
        {
          where?: { id?: string };
          data?: { status?: ServerJobStatus };
        },
      ]
    >;

    expect(
      updateCalls.some(
        ([entry]) =>
          entry.where?.id === 'job-timeout' &&
          entry.data?.status === ServerJobStatus.TIMEOUT,
      ),
    ).toBe(true);
  });

  // A2 (merge the separate "Logs" dialog into Job History): PREPARE_SERVER
  // jobs store the ServerRun they triggered as `payload.setupId` —
  // toPublicJob must surface just that one field, never the raw payload
  // (selectedOptions/resolvedRoles/retryOfSetupId stay internal).
  describe('toPublicJob', () => {
    it('derives setupId from payload for a PREPARE_SERVER job', () => {
      const { service } = createService();
      const job = {
        id: 'job-1',
        serverId: 'srv-1',
        type: ServerJobType.PREPARE_SERVER,
        status: ServerJobStatus.SUCCESS,
        payload: {
          setupId: 'run-42',
          selectedOptions: ['docker'],
          resolvedRoles: ['docker'],
          retryOfSetupId: null,
        },
      } as never;
      const result = service.toPublicJob(job);
      expect(result.setupId).toBe('run-42');
      expect(result).not.toHaveProperty('payload');
    });

    // Regression: job payloads written before the preparation->setup rename
    // still have the old key (JSON blob, no migration applies to it).
    it('falls back to the legacy preparationId key for jobs created before the rename', () => {
      const { service } = createService();
      const job = {
        id: 'job-legacy',
        serverId: 'srv-1',
        type: ServerJobType.PREPARE_SERVER,
        status: ServerJobStatus.SUCCESS,
        payload: {
          preparationId: 'run-legacy',
          selectedOptions: ['docker'],
        },
      } as never;
      expect(service.toPublicJob(job).setupId).toBe('run-legacy');
    });

    it('returns null setupId for job types with no payload (VERIFY, etc.)', () => {
      const { service } = createService();
      const job = {
        id: 'job-2',
        serverId: 'srv-1',
        type: ServerJobType.VERIFY,
        status: ServerJobStatus.SUCCESS,
        payload: null,
      } as never;
      expect(service.toPublicJob(job).setupId).toBeNull();
    });

    it('returns null setupId when payload is present but has no setupId key', () => {
      const { service } = createService();
      const job = {
        id: 'job-3',
        serverId: 'srv-1',
        type: ServerJobType.INSTALL_TOOLS,
        status: ServerJobStatus.SUCCESS,
        payload: { someOtherField: true },
      } as never;
      expect(service.toPublicJob(job).setupId).toBeNull();
    });
  });

  describe('createJobAtomic', () => {
    it('acquires the advisory lock and creates a job when none is active', async () => {
      const { service, tx } = createService();
      tx.serverJob.findFirst.mockResolvedValue(null);
      tx.serverJob.create.mockResolvedValue({
        id: 'job-new',
        serverId: 'srv-1',
      });

      const job = await service.createJobAtomic('srv-1', ServerJobType.VERIFY);

      expect(tx.$executeRaw).toHaveBeenCalled(); // pg_advisory_xact_lock
      expect(tx.serverJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            serverId: 'srv-1',
            type: ServerJobType.VERIFY,
          }),
        }),
      );
      expect(job).toEqual(expect.objectContaining({ id: 'job-new' }));
    });

    it('rejects with ConflictException when an active job already exists', async () => {
      const { service, tx } = createService();
      tx.serverJob.findFirst.mockResolvedValue({
        type: ServerJobType.PREPARE_SERVER,
      });

      await expect(
        service.createJobAtomic('srv-1', ServerJobType.VERIFY),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.serverJob.create).not.toHaveBeenCalled();
    });

    it('maps a P2002 unique-index violation to ConflictException (DB backstop)', async () => {
      const { service, tx } = createService();
      tx.serverJob.findFirst.mockResolvedValue(null);
      tx.serverJob.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.createJobAtomic('srv-1', ServerJobType.VERIFY),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

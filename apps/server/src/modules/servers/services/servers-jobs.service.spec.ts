import { BadRequestException } from '@nestjs/common';
import { ServerJobStatus, ServerJobType } from '@prisma/client';
import { ServersJobsService } from './servers-jobs.service';

describe('ServersJobsService', () => {
  function createService() {
    const prisma = {
      server: {
        findUnique: jest.fn(),
      },
      serverJob: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const ssh = {
      withTimeout: jest.fn(),
    };

    const service = new ServersJobsService(prisma as never, ssh as never);

    return { service, prisma, ssh };
  }

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
});

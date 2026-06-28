import { ServerLogLevel } from '@prisma/client';
import { ServerRunsService } from './server-runs.service';

type TxMock = {
  $executeRaw: jest.Mock;
  serverRunLog: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
};

function buildPrismaMock(lastLineNumber: number | null) {
  const tx: TxMock = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    serverRunLog: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          lastLineNumber === null ? null : { lineNumber: lastLineNumber },
        ),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          id: 'log-1',
          ...data,
        })),
    },
  };
  const prisma = {
    $transaction: jest
      .fn()
      .mockImplementation((cb: (tx: TxMock) => unknown) => cb(tx)),
    serverRunLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return { prisma, tx };
}

describe('ServerRunsService.appendLog', () => {
  it('starts numbering at 1 for the first line of a run', async () => {
    const { prisma, tx } = buildPrismaMock(null);
    const service = new ServerRunsService(prisma as never);

    const created = await service.appendLog('run-1', {
      level: ServerLogLevel.INFO,
      source: 'orchestrator',
      message: 'hello',
    });

    expect(created.lineNumber).toBe(1);
    expect(tx.serverRunLog.create).toHaveBeenCalledWith({
      data: {
        runId: 'run-1',
        serverId: null,
        level: ServerLogLevel.INFO,
        source: 'orchestrator',
        message: 'hello',
        lineNumber: 1,
      },
    });
  });

  it('increments from the last persisted line number', async () => {
    const { prisma } = buildPrismaMock(41);
    const service = new ServerRunsService(prisma as never);

    const created = await service.appendLog('run-1', {
      serverId: 'srv-9',
      level: ServerLogLevel.ERROR,
      source: 'ansible',
      message: 'boom',
    });

    expect(created.lineNumber).toBe(42);
    expect(created.serverId).toBe('srv-9');
  });

  it('takes a per-run advisory lock before reading the last line', async () => {
    const { prisma, tx } = buildPrismaMock(0);
    const service = new ServerRunsService(prisma as never);

    await service.appendLog('run-xyz', {
      level: ServerLogLevel.INFO,
      source: 's',
      message: 'm',
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const lockInvocation = tx.$executeRaw.mock.invocationCallOrder[0];
    const readInvocation =
      tx.serverRunLog.findFirst.mock.invocationCallOrder[0];
    expect(lockInvocation).toBeLessThan(readInvocation);
  });

  it('stores the message verbatim (caller is responsible for redaction)', async () => {
    const { prisma, tx } = buildPrismaMock(null);
    const service = new ServerRunsService(prisma as never);

    await service.appendLog('run-1', {
      level: ServerLogLevel.INFO,
      source: 's',
      message: 'token=secret123',
    });

    const calls = tx.serverRunLog.create.mock.calls as Array<
      [{ data: { message: string } }]
    >;
    expect(calls[0][0].data.message).toBe('token=secret123');
  });
});

describe('ServerRunsService.getLogs', () => {
  it('queries all lines ordered ascending when no afterLine is given', async () => {
    const { prisma } = buildPrismaMock(null);
    const service = new ServerRunsService(prisma as never);

    await service.getLogs('run-1');

    expect(prisma.serverRunLog.findMany).toHaveBeenCalledWith({
      where: { runId: 'run-1' },
      orderBy: { lineNumber: 'asc' },
      take: 1_000,
    });
  });

  it('filters to lines after the given line number', async () => {
    const { prisma } = buildPrismaMock(null);
    const service = new ServerRunsService(prisma as never);

    await service.getLogs('run-1', 10);

    expect(prisma.serverRunLog.findMany).toHaveBeenCalledWith({
      where: { runId: 'run-1', lineNumber: { gt: 10 } },
      orderBy: { lineNumber: 'asc' },
      take: 1_000,
    });
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServerRunStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ServerRunsService } from '../../infrastructure/server-runs/server-runs.service';
import { AutomationRunnerService } from './automation-runner.service';
import { AutomationService } from './automation.service';
import { AUTOMATION_ACTIONS } from '../shared/automation-options';

describe('AutomationService', () => {
  let prisma: {
    serverRun: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    server: { findMany: jest.Mock };
    auditLog: { createMany: jest.Mock };
  };
  let runner: { executeInBackground: jest.Mock; cancel: jest.Mock };
  let serverRuns: { getLogs: jest.Mock };
  let service: AutomationService;

  const actionKey = AUTOMATION_ACTIONS[0].key;

  beforeEach(() => {
    prisma = {
      serverRun: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'run1', steps: [] }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      server: { findMany: jest.fn().mockResolvedValue([{ id: 's1' }]) },
      auditLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    runner = { executeInBackground: jest.fn(), cancel: jest.fn() };
    serverRuns = { getLogs: jest.fn().mockResolvedValue([]) };
    service = new AutomationService(
      prisma as unknown as PrismaService,
      runner as unknown as AutomationRunnerService,
      serverRuns as unknown as ServerRunsService,
    );
  });

  it('exposes the static action catalogue', () => {
    expect(service.getActions()).toBe(AUTOMATION_ACTIONS);
  });

  it('rejects an unknown action', async () => {
    await expect(
      service.startRun({ actionKey: 'nope', serverIds: ['s1'] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when no target servers are provided', async () => {
    await expect(
      service.startRun({ actionKey, serverIds: [] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when some servers are missing or disabled', async () => {
    prisma.server.findMany.mockResolvedValue([]); // none found for ['s1']
    await expect(
      service.startRun({ actionKey, serverIds: ['s1'] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a run, audits it, and kicks off the background runner', async () => {
    await service.startRun({ actionKey, serverIds: ['s1'] } as never, 'admin');
    expect(prisma.serverRun.create).toHaveBeenCalled();
    expect(prisma.auditLog.createMany).toHaveBeenCalled();
    expect(runner.executeInBackground).toHaveBeenCalledWith('run1');
  });

  it('404s getRun for a missing automation run', async () => {
    prisma.serverRun.findFirst.mockResolvedValue(null);
    await expect(service.getRun('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('blocks cancel when the run is no longer active', async () => {
    prisma.serverRun.findFirst.mockResolvedValue({
      id: 'run1',
      status: ServerRunStatus.SUCCEEDED,
      steps: [],
    });
    await expect(service.cancelRun('run1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('cancels an active run and signals the runner', async () => {
    prisma.serverRun.findFirst
      .mockResolvedValueOnce({
        id: 'run1',
        status: ServerRunStatus.RUNNING,
        steps: [{ serverId: 's1' }],
      })
      .mockResolvedValueOnce({ id: 'run1', steps: [] }); // getRun at the end
    await service.cancelRun('run1', 'admin');
    expect(prisma.serverRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ServerRunStatus.CANCELED }),
      }),
    );
    expect(runner.cancel).toHaveBeenCalledWith('run1');
  });

  it('refuses to delete an active run', async () => {
    prisma.serverRun.findFirst.mockResolvedValue({
      id: 'run1',
      status: ServerRunStatus.RUNNING,
    });
    await expect(service.deleteRun('run1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

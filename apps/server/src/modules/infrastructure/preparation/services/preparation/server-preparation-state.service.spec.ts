import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServerRunStatus, ServerRunStepStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/database/prisma.service';
import { ServerPreparationGateway } from '../../gateways/server-preparation.gateway';
import { ServerPreparationStateService } from './server-preparation-state.service';

describe('ServerPreparationStateService (state machine)', () => {
  let prisma: {
    serverRun: { findUnique: jest.Mock; update: jest.Mock };
    serverRunStep: { updateMany: jest.Mock };
  };
  let gateway: { emitStatus: jest.Mock };
  let svc: ServerPreparationStateService;

  beforeEach(() => {
    prisma = {
      serverRun: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: ServerRunStatus.QUEUED }),
        update: jest.fn().mockResolvedValue({}),
      },
      serverRunStep: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    gateway = { emitStatus: jest.fn() };
    svc = new ServerPreparationStateService(
      prisma as unknown as PrismaService,
      gateway as unknown as ServerPreparationGateway,
    );
  });

  describe('transitionPreparation', () => {
    it('allows a valid transition + emits the status', async () => {
      await svc.transitionPreparation('p1', ServerRunStatus.RESOLVING_OPTIONS);
      expect(prisma.serverRun.update).toHaveBeenCalled();
      expect(gateway.emitStatus).toHaveBeenCalledWith({
        preparationId: 'p1',
        status: ServerRunStatus.RESOLVING_OPTIONS,
      });
    });

    it('rejects an invalid transition (QUEUED → RUNNING)', async () => {
      await expect(
        svc.transitionPreparation('p1', ServerRunStatus.RUNNING),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.serverRun.update).not.toHaveBeenCalled();
    });

    it('throws NotFound when the run is missing', async () => {
      prisma.serverRun.findUnique.mockResolvedValue(null);
      await expect(
        svc.transitionPreparation('ghost', ServerRunStatus.CANCELED),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets startedAt when moving to RUNNING', async () => {
      prisma.serverRun.findUnique.mockResolvedValue({
        status: ServerRunStatus.WAITING_FOR_LOCK,
      });
      await svc.transitionPreparation('p1', ServerRunStatus.RUNNING);
      expect(
        prisma.serverRun.update.mock.calls[0][0].data.startedAt,
      ).toBeInstanceOf(Date);
    });

    it('allows a no-op transition to the same status', async () => {
      prisma.serverRun.findUnique.mockResolvedValue({
        status: ServerRunStatus.RUNNING,
      });
      await expect(
        svc.transitionPreparation('p1', ServerRunStatus.RUNNING),
      ).resolves.toBeUndefined();
    });
  });

  describe('markFailedRunningTasks', () => {
    it('marks RUNNING steps FAILED and PENDING steps SKIPPED', async () => {
      await svc.markFailedRunningTasks('p1', false);
      const statuses = prisma.serverRunStep.updateMany.mock.calls.map(
        (c) => c[0].data.status,
      );
      expect(statuses).toContain(ServerRunStepStatus.FAILED);
      expect(statuses).toContain(ServerRunStepStatus.SKIPPED);
    });

    it('uses TIMEOUT for the running steps on a timeout', async () => {
      await svc.markFailedRunningTasks('p1', true);
      const statuses = prisma.serverRunStep.updateMany.mock.calls.map(
        (c) => c[0].data.status,
      );
      expect(statuses).toContain(ServerRunStepStatus.TIMEOUT);
    });
  });

  describe('markAllRemainingTasks', () => {
    it('updates PENDING/RUNNING steps to the given status', async () => {
      await svc.markAllRemainingTasks('p1', ServerRunStepStatus.CANCELED);
      expect(prisma.serverRunStep.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ServerRunStepStatus.CANCELED,
          }),
        }),
      );
    });
  });
});

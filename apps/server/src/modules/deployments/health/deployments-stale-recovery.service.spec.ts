import { DeploymentStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { STALE_THRESHOLD_MINUTES } from '../utils/deployment-stale.constants';
import { DeploymentsStaleRecoveryService } from './deployments-stale-recovery.service';

describe('DeploymentsStaleRecoveryService', () => {
  let service: DeploymentsStaleRecoveryService;
  let findMany: jest.Mock;
  let updateMany: jest.Mock;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      deployment: { findMany, updateMany },
    } as unknown as PrismaService;
    service = new DeploymentsStaleRecoveryService(prisma);
  });

  it('does nothing when no stale deployments found', async () => {
    await service.recoverStaleDeployments();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('queries RUNNING and PENDING deployments older than the cutoff', async () => {
    const before = Date.now();
    await service.recoverStaleDeployments();
    const after = Date.now();

    const call = findMany.mock.calls[0][0];
    expect(call.where.status.in).toEqual(
      expect.arrayContaining([
        DeploymentStatus.RUNNING,
        DeploymentStatus.PENDING,
      ]),
    );

    const cutoff: Date = call.where.updatedAt.lt;
    const thresholdMs = STALE_THRESHOLD_MINUTES * 60 * 1_000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - thresholdMs - 50);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - thresholdMs + 50);
  });

  it('marks each stale deployment as FAILED with finishedAt', async () => {
    findMany.mockResolvedValue([{ id: 'd1', logs: 'build log' }]);
    updateMany.mockResolvedValue({ count: 1 });

    await service.recoverStaleDeployments();

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'd1' }),
        data: expect.objectContaining({
          status: DeploymentStatus.FAILED,
          finishedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('appends recovery note to existing logs', async () => {
    findMany.mockResolvedValue([{ id: 'd1', logs: 'existing log line' }]);
    updateMany.mockResolvedValue({ count: 1 });

    await service.recoverStaleDeployments();

    const data = updateMany.mock.calls[0][0].data;
    expect(data.logs).toContain('existing log line');
    expect(data.logs).toContain('[RECOVERY]');
  });

  it('handles null logs without prepending empty line', async () => {
    findMany.mockResolvedValue([{ id: 'd1', logs: null }]);
    updateMany.mockResolvedValue({ count: 1 });

    await service.recoverStaleDeployments();

    const data = updateMany.mock.calls[0][0].data;
    expect(data.logs).toContain('[RECOVERY]');
    expect(data.logs).not.toMatch(/^\n/);
  });

  it('processes multiple stale deployments individually', async () => {
    findMany.mockResolvedValue([
      { id: 'd1', logs: 'log1' },
      { id: 'd2', logs: 'log2' },
      { id: 'd3', logs: null },
    ]);
    updateMany.mockResolvedValue({ count: 1 });

    await service.recoverStaleDeployments();

    expect(updateMany).toHaveBeenCalledTimes(3);
    const ids = updateMany.mock.calls.map((c) => c[0].where.id);
    expect(ids).toEqual(expect.arrayContaining(['d1', 'd2', 'd3']));
  });

  it('per-row updateMany guard keeps status+updatedAt constraint (idempotency)', async () => {
    findMany.mockResolvedValue([{ id: 'd1', logs: '' }]);
    // deployment finished between fetch and update — count=0 is fine
    updateMany.mockResolvedValue({ count: 0 });

    await expect(service.recoverStaleDeployments()).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({ in: expect.any(Array) }),
          updatedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );
  });

  it('sets conditions field on updated deployment', async () => {
    findMany.mockResolvedValue([{ id: 'd1', logs: '' }]);
    updateMany.mockResolvedValue({ count: 1 });

    await service.recoverStaleDeployments();

    const data = updateMany.mock.calls[0][0].data;
    expect(data.conditions).toBeDefined();
  });
});

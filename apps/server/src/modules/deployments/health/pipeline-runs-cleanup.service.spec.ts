import { PrismaService } from '../../../shared/database/prisma.service';
import { PipelineRunsCleanupService } from './pipeline-runs-cleanup.service';

describe('PipelineRunsCleanupService', () => {
  let service: PipelineRunsCleanupService;
  let updateMany: jest.Mock;
  let deleteMany: jest.Mock;

  beforeEach(() => {
    updateMany = jest.fn().mockResolvedValue({ count: 0 });
    deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      pipelineRun: { updateMany, deleteMany },
    } as unknown as PrismaService;
    service = new PipelineRunsCleanupService(prisma);
  });

  it('runs all three DB operations in a single parallel batch', async () => {
    await service.cleanupStalePipelineRuns();
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it('marks PENDING rows older than 7 days as FAILED', async () => {
    await service.cleanupStalePipelineRuns();

    const call = updateMany.mock.calls.find((c) => c[0].where.status === 'PENDING');
    expect(call).toBeDefined();
    expect(call[0].data).toEqual({ status: 'FAILED' });

    const cutoff: Date = call[0].where.createdAt.lt;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(sevenDaysMs - 1000);
    expect(Date.now() - cutoff.getTime()).toBeLessThanOrEqual(sevenDaysMs + 1000);
  });

  it('marks RUNNING rows older than 24 h as FAILED', async () => {
    await service.cleanupStalePipelineRuns();

    const call = updateMany.mock.calls.find((c) => c[0].where.status === 'RUNNING');
    expect(call).toBeDefined();
    expect(call[0].data).toEqual({ status: 'FAILED' });

    const cutoff: Date = call[0].where.updatedAt.lt;
    const oneDayMs = 24 * 60 * 60 * 1000;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(oneDayMs - 1000);
    expect(Date.now() - cutoff.getTime()).toBeLessThanOrEqual(oneDayMs + 1000);
  });

  it('hard-deletes terminal rows older than 90 days', async () => {
    await service.cleanupStalePipelineRuns();

    const call = deleteMany.mock.calls[0][0];
    expect(call.where.status.in).toEqual(
      expect.arrayContaining(['SUCCESS', 'FAILED', 'CANCELED', 'IGNORED']),
    );

    const cutoff: Date = call.where.updatedAt.lt;
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(ninetyDaysMs - 1000);
    expect(Date.now() - cutoff.getTime()).toBeLessThanOrEqual(ninetyDaysMs + 1000);
  });

  it('completes without throwing when no rows match', async () => {
    await expect(service.cleanupStalePipelineRuns()).resolves.toBeUndefined();
  });

  it('completes without throwing when all counts are non-zero', async () => {
    updateMany.mockResolvedValue({ count: 3 });
    deleteMany.mockResolvedValue({ count: 12 });
    await expect(service.cleanupStalePipelineRuns()).resolves.toBeUndefined();
  });
});

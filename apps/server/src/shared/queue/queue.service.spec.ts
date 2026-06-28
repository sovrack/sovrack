import { Queue } from 'bullmq';
import { QueueService } from './queue.service';

describe('QueueService', () => {
  let queue: {
    add: jest.Mock;
    getWaitingCount: jest.Mock;
    getActiveCount: jest.Mock;
    getCompletedCount: jest.Mock;
    getFailedCount: jest.Mock;
  };
  let service: QueueService;

  beforeEach(() => {
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getWaitingCount: jest.fn().mockResolvedValue(1),
      getActiveCount: jest.fn().mockResolvedValue(2),
      getCompletedCount: jest.fn().mockResolvedValue(3),
      getFailedCount: jest.fn().mockResolvedValue(4),
    };
    service = new QueueService(queue as unknown as Queue);
  });

  it('enqueues a deploy job without auto-retry and returns its id', async () => {
    const id = await service.enqueueDeploy('dep-1', 'img:sha');
    expect(id).toBe('job-1');
    expect(queue.add).toHaveBeenCalledWith(
      'deploy',
      { deploymentId: 'dep-1', overrideImage: 'img:sha' },
      // attempts: 1 — the executor rolls back to the previous container on
      // failure, so retrying would only flap the old container.
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it('enqueues a rollback job (deploymentId → targetDeploymentId)', async () => {
    await service.enqueueRollback('dep-1', 'dep-0');
    expect(queue.add).toHaveBeenCalledWith(
      'rollback',
      { deploymentId: 'dep-1', targetDeploymentId: 'dep-0' },
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it('returns an empty string when BullMQ yields no job id', async () => {
    queue.add.mockResolvedValueOnce({ id: undefined });
    expect(await service.enqueueDeploy('dep-2')).toBe('');
  });

  it('aggregates queue counts', async () => {
    expect(await service.getQueueStatus()).toEqual({
      waiting: 1,
      active: 2,
      completed: 3,
      failed: 4,
    });
  });
});

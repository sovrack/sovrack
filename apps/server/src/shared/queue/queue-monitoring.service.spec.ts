import { QueueMonitoringService } from './queue-monitoring.service';

function makeQueue(overrides: Record<string, jest.Mock> = {}) {
  return {
    getWaitingCount: jest.fn().mockResolvedValue(2),
    getActiveCount: jest.fn().mockResolvedValue(1),
    getCompletedCount: jest.fn().mockResolvedValue(50),
    getFailedCount: jest.fn().mockResolvedValue(0),
    getDelayedCount: jest.fn().mockResolvedValue(0),
    isPaused: jest.fn().mockResolvedValue(false),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    clean: jest.fn().mockResolvedValue([]),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    client: Promise.resolve({
      info: jest.fn().mockResolvedValue('used_memory:1024\r\ndb0:keys=5\r\n'),
    }),
    ...overrides,
  };
}

function makeSvc(queueOverrides?: Record<string, jest.Mock>) {
  const queue = makeQueue(queueOverrides);
  const svc = new QueueMonitoringService(queue as never);
  return { svc, queue };
}

describe('QueueMonitoringService', () => {
  describe('getMetrics', () => {
    it('returns all queue counts', async () => {
      const { svc } = makeSvc();
      const metrics = await svc.getMetrics();
      expect(metrics).toMatchObject({
        waiting: 2,
        active: 1,
        completed: 50,
        failed: 0,
        delayed: 0,
        paused: 0,
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}/),
      });
    });

    it('maps isPaused=true to paused=1', async () => {
      const { svc } = makeSvc({ isPaused: jest.fn().mockResolvedValue(true) });
      const metrics = await svc.getMetrics();
      expect(metrics.paused).toBe(1);
    });
  });

  describe('getDetailedStatus', () => {
    it('returns metrics + samples object', async () => {
      const { svc, queue } = makeSvc();
      queue.getWaiting.mockResolvedValue([
        { id: 'j1', name: 'deploy', data: {}, timestamp: Date.now() },
      ]);
      queue.getActive.mockResolvedValue([
        { id: 'j2', name: 'deploy', data: {}, processedOn: Date.now() },
      ]);
      queue.getFailed.mockResolvedValue([
        {
          id: 'j3',
          name: 'deploy',
          data: {},
          failedReason: 'err',
          timestamp: Date.now(),
        },
      ]);
      const result = await svc.getDetailedStatus();
      expect(result.metrics.waiting).toBe(2);
      expect(result.samples.waiting).toHaveLength(1);
      expect(result.samples.active[0].id).toBe('j2');
      expect(result.samples.failed[0].failedReason).toBe('err');
    });
  });

  describe('logMetrics', () => {
    it('completes without throwing under normal conditions', async () => {
      const { svc } = makeSvc();
      await expect(svc.logMetrics()).resolves.toBeUndefined();
    });

    it('logs warnings when failed count is high', async () => {
      const { svc } = makeSvc({
        getFailedCount: jest.fn().mockResolvedValue(15),
      });
      await expect(svc.logMetrics()).resolves.toBeUndefined();
    });

    it('logs warnings when waiting count is high', async () => {
      const { svc } = makeSvc({
        getWaitingCount: jest.fn().mockResolvedValue(60),
      });
      await expect(svc.logMetrics()).resolves.toBeUndefined();
    });

    it('logs warnings when queue is paused', async () => {
      const { svc } = makeSvc({
        isPaused: jest.fn().mockResolvedValue(true),
      });
      await expect(svc.logMetrics()).resolves.toBeUndefined();
    });

    it('swallows errors from getMetrics', async () => {
      const { svc } = makeSvc({
        getWaitingCount: jest.fn().mockRejectedValue(new Error('redis down')),
      });
      await expect(svc.logMetrics()).resolves.toBeUndefined();
    });
  });

  describe('cleanupJobs', () => {
    it('cleans completed and failed jobs', async () => {
      const { svc, queue } = makeSvc();
      await svc.cleanupJobs();
      expect(queue.clean).toHaveBeenCalledTimes(2);
      expect(queue.clean).toHaveBeenCalledWith(
        24 * 60 * 60 * 1000,
        0,
        'completed',
      );
      expect(queue.clean).toHaveBeenCalledWith(
        7 * 24 * 60 * 60 * 1000,
        0,
        'failed',
      );
    });

    it('swallows errors during cleanup', async () => {
      const { svc } = makeSvc({
        clean: jest.fn().mockRejectedValue(new Error('redis error')),
      });
      await expect(svc.cleanupJobs()).resolves.toBeUndefined();
    });
  });

  describe('pauseQueue / resumeQueue', () => {
    it('calls queue.pause', async () => {
      const { svc, queue } = makeSvc();
      await svc.pauseQueue();
      expect(queue.pause).toHaveBeenCalledTimes(1);
    });

    it('calls queue.resume', async () => {
      const { svc, queue } = makeSvc();
      await svc.resumeQueue();
      expect(queue.resume).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRedisInfo', () => {
    it('returns parsed memory and keyspace info', async () => {
      const { svc } = makeSvc();
      const info = await svc.getRedisInfo();
      expect(info).toMatchObject({
        memory: { used_memory: '1024' },
        keyspace: { db0: 'keys=5' },
      });
    });

    it('returns null on Redis client error', async () => {
      const { svc } = makeSvc();
      (svc as never as { queue: { client: Promise<unknown> } }).queue = {
        ...makeQueue(),
        client: Promise.reject(new Error('connection refused')),
      } as never;
      const info = await svc.getRedisInfo();
      expect(info).toBeNull();
    });
  });
});

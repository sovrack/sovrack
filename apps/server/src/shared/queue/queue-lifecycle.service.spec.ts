import { Queue } from 'bullmq';
import { QueueLifecycleService } from './queue-lifecycle.service';

describe('QueueLifecycleService', () => {
  it('closes every BullMQ producer connection', async () => {
    const queues = Array.from({ length: 3 }, () => ({
      close: jest.fn().mockResolvedValue(undefined),
    }));
    const service = new QueueLifecycleService(
      queues[0] as unknown as Queue,
      queues[1] as unknown as Queue,
      queues[2] as unknown as Queue,
    );

    await service.onModuleDestroy();

    for (const queue of queues) expect(queue.close).toHaveBeenCalledTimes(1);
  });
});

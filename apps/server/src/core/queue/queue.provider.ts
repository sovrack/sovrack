import { FactoryProvider } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';

export const DEPLOYMENTS_QUEUE = 'deployments';

export const bullQueueProvider: FactoryProvider<Queue> = {
  provide: 'DEPLOYMENTS_QUEUE',
  useFactory: () => {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      throw new Error('REDIS_URL is required for BullMQ queue');
    }
    return new Queue(DEPLOYMENTS_QUEUE, { connection: { url } });
  },
};

export function createDeploymentsWorker(
  processor: (job: any) => Promise<void>,
): Worker {
  const url = process.env.REDIS_URL?.trim();
  return new Worker(DEPLOYMENTS_QUEUE, processor, {
    connection: { url },
    concurrency: 3,
  });
}

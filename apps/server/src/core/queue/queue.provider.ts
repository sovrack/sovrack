import { FactoryProvider } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';

export const DEPLOYMENTS_QUEUE = 'deployments';

const REDIS_URL_HELP =
  '[BOOT ERROR] REDIS_URL is required.\n' +
  'BullMQ cannot start without Redis.\n' +
  '→ Start Redis: docker run -p 6379:6379 redis:7-alpine\n' +
  '→ Then set REDIS_URL=redis://localhost:6379 in your .env';

/** Resolve REDIS_URL or throw the actionable boot help (single source). */
function requireRedisUrl(): string {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error(REDIS_URL_HELP);
  }
  return url;
}

export const bullQueueProvider: FactoryProvider<Queue> = {
  provide: 'DEPLOYMENTS_QUEUE',
  useFactory: () => {
    return new Queue(DEPLOYMENTS_QUEUE, { connection: { url: requireRedisUrl() } });
  },
};

export function createDeploymentsWorker(
  processor: (job: Job) => Promise<void>,
): Worker {
  return new Worker(DEPLOYMENTS_QUEUE, processor, {
    connection: { url: requireRedisUrl() },
    concurrency: 3,
  });
}

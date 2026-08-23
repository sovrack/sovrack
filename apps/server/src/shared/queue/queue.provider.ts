import { FactoryProvider } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';

export const DEPLOYMENTS_QUEUE = 'deployments';
// Server-setup (Ansible provisioning of ONE server) runs.
export const SETUP_QUEUE = 'server-setups';
// Automation (the /automation feature: one action across N servers) runs.
export const AUTOMATION_RUNS_QUEUE = 'automation-runs';

const REDIS_URL_HELP =
  '[BOOT ERROR] REDIS_URL is required.\n' +
  'BullMQ cannot start without Redis.\n' +
  '-> Start Redis: docker run -p 6379:6379 redis:7-alpine\n' +
  '-> Then set REDIS_URL=redis://localhost:6379 in your .env';

/** Resolve REDIS_URL or throw the actionable boot help (single source). */
function requireRedisUrl(): string {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error(REDIS_URL_HELP);
  }
  return url;
}

/**
 * Swagger only needs Nest metadata. Opening Redis sockets while exporting the
 * contract makes the build non-deterministic and used to hide connection
 * errors behind a forced process exit.
 */
function createQueue(name: string): Queue {
  if (process.env.OPENAPI_EXPORT === 'true') {
    return {
      name,
      close: () => Promise.resolve(),
    } as unknown as Queue;
  }
  return new Queue(name, { connection: { url: requireRedisUrl() } });
}

export const bullQueueProvider: FactoryProvider<Queue> = {
  provide: 'DEPLOYMENTS_QUEUE',
  useFactory: () => {
    return createQueue(DEPLOYMENTS_QUEUE);
  },
};

export const bullSetupQueueProvider: FactoryProvider<Queue> = {
  provide: 'SETUP_QUEUE',
  useFactory: () => {
    return createQueue(SETUP_QUEUE);
  },
};

export const bullAutomationRunsQueueProvider: FactoryProvider<Queue> = {
  provide: 'AUTOMATION_RUNS_QUEUE',
  useFactory: () => {
    return createQueue(AUTOMATION_RUNS_QUEUE);
  },
};

// Shared tuning for both Ansible-run queues (setup + automation): long jobs,
// low concurrency (spawns ansible-playbook subprocesses), generous stall window.
function ansibleWorkerOptions() {
  return {
    connection: { url: requireRedisUrl() },
    concurrency: 3,
    stalledInterval: 60000,
    maxStalledCount: 1,
  };
}

export function createDeploymentsWorker(
  processor: (job: Job) => Promise<void>,
): Worker {
  return new Worker(DEPLOYMENTS_QUEUE, processor, {
    connection: { url: requireRedisUrl() },
    concurrency: 5,
    // BullMQ : stalledInterval / maxStalledCount sont des options RACINE du
    // Worker (pas sous `settings`, qui est de type AdvancedOptions et ne les
    // contient pas — d'où l'erreur TS2353 quand elles y étaient imbriquées).
    stalledInterval: 30000,
    maxStalledCount: 1,
    limiter: {
      max: 10,
      duration: 60000,
    },
  });
}

export function createSetupWorker(
  processor: (job: Job) => Promise<void>,
): Worker {
  return new Worker(SETUP_QUEUE, processor, ansibleWorkerOptions());
}

export function createAutomationRunsWorker(
  processor: (job: Job) => Promise<void>,
): Worker {
  return new Worker(AUTOMATION_RUNS_QUEUE, processor, ansibleWorkerOptions());
}

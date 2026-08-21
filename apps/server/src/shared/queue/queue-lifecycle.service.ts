import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

/**
 * Closes the BullMQ producer connections during Nest shutdown.
 *
 * BullMQ Queue instances expose `close()` rather than Nest's lifecycle hook,
 * so factory-provided queues otherwise keep Redis sockets alive after the
 * application (and its tests) have been closed.
 */
@Injectable()
export class QueueLifecycleService implements OnModuleDestroy {
  constructor(
    @Inject('DEPLOYMENTS_QUEUE') private readonly deployments: Queue,
    @Inject('SETUP_QUEUE') private readonly setups: Queue,
    @Inject('AUTOMATION_RUNS_QUEUE') private readonly automationRuns: Queue,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.deployments.close(),
      this.setups.close(),
      this.automationRuns.close(),
    ]);
  }
}

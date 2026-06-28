import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export type DeployJobData = {
  deploymentId: string;
  overrideImage?: string;
};

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject('DEPLOYMENTS_QUEUE') private readonly deploymentsQueue: Queue,
  ) {}

  /**
   * Enqueue a deployment for async execution by the BullMQ worker.
   *
   * Note: rollbacks intentionally do NOT go through the queue. They are
   * human-triggered, low-frequency, and run synchronously via a direct
   * `executeDeploy(rollbackId, pinnedImageRef)` call in
   * DeploymentsRollbackService. The former `enqueueRollback`/`handleRollback`
   * path was dead code with a latent bug (it passed a Deployment UUID into the
   * `overrideImage` slot, where a Docker image ref is expected) and was removed.
   */
  async enqueueDeploy(
    deploymentId: string,
    overrideImage?: string,
  ): Promise<string> {
    const job = await this.deploymentsQueue.add(
      'deploy',
      { deploymentId, overrideImage } satisfies DeployJobData,
      {
        // No auto-retry: the executor now rolls the service back to the previous
        // container on failure, so retrying would just flap (stop/restart the
        // old container) and rebuild for nothing on a permanent error. The user
        // re-deploys explicitly; transient infra blips are handled by recovery.
        attempts: 1,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    );
    this.logger.log(
      `Deploy job ${job.id} enqueued for deployment ${deploymentId}`,
    );
    return job.id ?? '';
  }

  async getQueueStatus() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.deploymentsQueue.getWaitingCount(),
      this.deploymentsQueue.getActiveCount(),
      this.deploymentsQueue.getCompletedCount(),
      this.deploymentsQueue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  }
}

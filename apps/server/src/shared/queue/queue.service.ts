import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export type DeployJobData = {
  deploymentId: string;
  overrideImage?: string;
};

export type RollbackJobData = {
  deploymentId: string;
  targetDeploymentId: string;
};

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject('DEPLOYMENTS_QUEUE') private readonly deploymentsQueue: Queue,
  ) {}

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

  async enqueueRollback(
    deploymentId: string,
    targetDeploymentId: string,
  ): Promise<string> {
    const job = await this.deploymentsQueue.add(
      'rollback',
      { deploymentId, targetDeploymentId } satisfies RollbackJobData,
      {
        // Same as deploy: no auto-retry (recovery keeps the old container up).
        attempts: 1,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    );
    this.logger.log(
      `Rollback job ${job.id} enqueued: ${deploymentId} → ${targetDeploymentId}`,
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

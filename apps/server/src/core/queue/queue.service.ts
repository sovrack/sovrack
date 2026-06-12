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
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    );
    this.logger.log(`Deploy job ${job.id} enqueued for deployment ${deploymentId}`);
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
        attempts: 2,
        backoff: { type: 'fixed', delay: 10000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    );
    this.logger.log(`Rollback job ${job.id} enqueued: ${deploymentId} → ${targetDeploymentId}`);
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

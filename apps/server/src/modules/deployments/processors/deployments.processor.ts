import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { createDeploymentsWorker } from '../../../core/queue/queue.provider';
import type {
  DeployJobData,
  RollbackJobData,
} from '../../../core/queue/queue.service';
import { DockerDeployExecutorService } from '../core/docker-deploy-executor.service';

@Injectable()
export class DeploymentsProcessor implements OnModuleInit {
  private readonly logger = new Logger(DeploymentsProcessor.name);

  constructor(private readonly executor: DockerDeployExecutorService) {}

  async onModuleInit(): Promise<void> {
    const worker = createDeploymentsWorker(this.processJob.bind(this));
    worker.on('completed', (job: Job) => {
      this.logger.log(`Job ${job.id} (${job.name}) completed`);
    });
    worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });
    this.logger.log('Deployments worker started');
  }

  private async processJob(job: Job): Promise<void> {
    switch (job.name) {
      case 'deploy':
        return this.handleDeploy(job.data as DeployJobData);
      case 'rollback':
        return this.handleRollback(job.data as RollbackJobData);
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  private async handleDeploy(data: DeployJobData): Promise<void> {
    await this.executor.executeDeploy(data.deploymentId, data.overrideImage);
  }

  private async handleRollback(data: RollbackJobData): Promise<void> {
    // A rollback deployment record is pre-created by DeploymentsRollbackService
    // before the job is enqueued. The job just needs to execute the deploy with
    // the pinned image override that was resolved at creation time.
    await this.executor.executeDeploy(
      data.deploymentId,
      data.targetDeploymentId,
    );
  }
}

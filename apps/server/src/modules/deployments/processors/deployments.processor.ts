import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { createDeploymentsWorker } from '../../../shared/queue/queue.provider';
import type { DeployJobData } from '../../../shared/queue/queue.service';
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
      default:
        // Rollbacks run synchronously (see DeploymentsRollbackService) and are
        // never enqueued, so 'deploy' is the only job type this worker handles.
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  private async handleDeploy(data: DeployJobData): Promise<void> {
    await this.executor.executeDeploy(data.deploymentId, data.overrideImage);
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Job } from 'bullmq';
import { createDeploymentsWorker } from '../../../core/queue/queue.provider';
import type { DeployJobData, RollbackJobData } from '../../../core/queue/queue.service';

@Injectable()
export class DeploymentsProcessor implements OnModuleInit {
  private readonly logger = new Logger(DeploymentsProcessor.name);

  constructor(private readonly moduleRef: ModuleRef) {}

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
    const executor = this.moduleRef.get('DockerDeployExecutorService', { strict: false }) as any;
    if (!executor) {
      this.logger.error('DockerDeployExecutorService not available');
      return;
    }
    await executor.executeDeploy(data.deploymentId, data.overrideImage);
  }

  private async handleRollback(data: RollbackJobData): Promise<void> {
    const rollbackService = this.moduleRef.get('DeploymentsRollbackService', { strict: false }) as any;
    if (!rollbackService) {
      this.logger.error('DeploymentsRollbackService not available');
      return;
    }
    await rollbackService.rollback(data.deploymentId, data.targetDeploymentId);
  }
}

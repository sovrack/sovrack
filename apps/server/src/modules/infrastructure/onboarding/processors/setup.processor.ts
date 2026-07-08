import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { createSetupWorker } from '../../../../shared/queue/queue.provider';
import type { SetupJobData } from '../../../../shared/queue/queue.service';
import { runsBackgroundWork } from '../../../../shared/utils/process-role.util';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type { SetupRoleKey } from '../../servers/shared/server-setup-options';
import { InfraSetupRunnerService } from '../services/infra-setup-runner.service';

/**
 * Worker-side consumer of the `automation` queue. Runs the heavy Ansible setup
 * off the API request path. Only started in a process that does background work
 * (worker role, or the default single-process "all" mode) — the API-only role
 * enqueues jobs but never starts this Worker.
 */
@Injectable()
export class SetupProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SetupProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: InfraSetupRunnerService,
  ) {}

  onModuleInit(): void {
    if (!runsBackgroundWork()) {
      this.logger.log('API role: setup worker not started (worker-only)');
      return;
    }
    this.worker = createSetupWorker(this.processJob.bind(this));
    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`Setup job ${job?.id} failed: ${err.message}`);
    });
    this.logger.log('Setup worker started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  private async processJob(job: Job): Promise<void> {
    if (job.name !== 'setup') {
      this.logger.warn(`Unknown setup job type: ${job.name}`);
      return;
    }
    const { serverId, setupId, jobId, roles } = job.data as SetupJobData;
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      this.logger.error(
        `Setup ${setupId}: server ${serverId} not found — skipping run`,
      );
      return;
    }
    await this.runner.runSetupJob(
      server,
      setupId,
      jobId,
      roles as SetupRoleKey[],
    );
  }
}

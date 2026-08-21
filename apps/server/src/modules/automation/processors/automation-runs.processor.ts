import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { createAutomationRunsWorker } from '../../../shared/queue/queue.provider';
import type { AutomationRunJobData } from '../../../shared/queue/queue.service';
import { runsBackgroundWork } from '../../../shared/utils/process-role.util';
import { AutomationRunnerService } from '../services/automation-runner.service';
import { PrismaService } from '../../../shared/database/prisma.service';

/**
 * Worker-side consumer of the `automation-runs` queue (the /automation feature:
 * one action across N servers). Runs Ansible off the API request path. Only
 * started in a process that does background work — the API-only role enqueues
 * jobs but never starts this Worker.
 */
@Injectable()
export class AutomationRunsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationRunsProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly runner: AutomationRunnerService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    if (!runsBackgroundWork()) {
      this.logger.log('API role: automation-runs worker not started');
      return;
    }
    this.worker = createAutomationRunsWorker(this.processJob.bind(this));
    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`Automation-run job ${job?.id} failed: ${err.message}`);
    });
    this.logger.log('Automation-runs worker started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  private async processJob(job: Job): Promise<void> {
    if (job.name !== 'automation-run') {
      this.logger.warn(`Unknown automation-run job type: ${job.name}`);
      return;
    }
    const { runId, workspaceId } = job.data as AutomationRunJobData;
    const run = await this.prisma.serverRun.findFirst({
      where: { id: runId, teamId: workspaceId },
      select: { id: true },
    });
    if (!run) {
      throw new Error('Automation job workspace mismatch');
    }
    await this.runner.runAutomationJob(runId);
  }
}

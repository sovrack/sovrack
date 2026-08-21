import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export type DeployJobData = {
  deploymentId: string;
  workspaceId: string;
  overrideImage?: string;
};

/**
 * Payload for a server-setup run executed by the worker process. Carries only
 * primitive ids/roles (BullMQ serializes to JSON) — the worker re-fetches the
 * Server row and re-hydrates everything it needs from the DB.
 */
export type SetupJobData = {
  workspaceId: string;
  serverId: string;
  setupId: string;
  jobId: string;
  roles: string[];
};

/** Payload for an automation run (/automation feature) executed by the worker. */
export type AutomationRunJobData = {
  workspaceId: string;
  runId: string;
};

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject('DEPLOYMENTS_QUEUE') private readonly deploymentsQueue: Queue,
    @Inject('SETUP_QUEUE') private readonly setupQueue: Queue,
    @Inject('AUTOMATION_RUNS_QUEUE')
    private readonly automationRunsQueue: Queue,
  ) {}

  /** Enqueue deploys, webhook continuations and rollbacks on the worker. */
  async enqueueDeploy(
    deploymentId: string,
    workspaceId: string,
    overrideImage?: string,
  ): Promise<string> {
    const job = await this.deploymentsQueue.add(
      'deploy',
      { deploymentId, workspaceId, overrideImage } satisfies DeployJobData,
      {
        // Stable id makes producer retries idempotent while the job exists.
        jobId: `deployment-${deploymentId}`,
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

  /**
   * Enqueue a server-setup run for async execution by the worker process.
   * The API process returns immediately; the worker picks the job up and runs
   * Ansible off the request path. A DB-backed ServerJob lock (created before
   * this call) already guards against two concurrent runs on the same server.
   */
  async enqueueSetup(data: SetupJobData): Promise<string> {
    const job = await this.setupQueue.add('setup', data, {
      // The run either completes or is failed by the worker's own timeout /
      // abort handling — a BullMQ auto-retry would re-run a partially applied
      // Ansible playbook, which is not what we want. Explicit user retry only.
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    });
    this.logger.log(`Setup job ${job.id} enqueued for setup ${data.setupId}`);
    return job.id ?? '';
  }

  /**
   * Enqueue an automation run (/automation feature: one action over N servers)
   * for async execution by the worker process. Same no-auto-retry rationale as
   * setups — the run's own outcome is authoritative.
   */
  async enqueueAutomationRun(data: AutomationRunJobData): Promise<string> {
    const job = await this.automationRunsQueue.add('automation-run', data, {
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    });
    this.logger.log(
      `Automation-run job ${job.id} enqueued for run ${data.runId}`,
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

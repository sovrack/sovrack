import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Server,
  ServerJobStatus,
  ServerJobType,
  ServerOnboardingStep,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PaginationDto } from '../../../../shared/http/pagination.dto';
import { ServersJobsService } from './servers-jobs.service';
import { ServersConnectionService } from './servers-connection.service';
import { ServersDetectionService } from './servers-detection.service';
import { ServersAuditService } from './servers-audit.service';
import {
  RegisterRunnerPayload,
  ServerActiveJob,
  ServerJobsListResult,
  ServerPublic,
} from '../shared/servers.types';
import { toPublicServer } from '../shared/server-public.util';

const ACTIVE_JOB_STATUSES: ServerJobStatus[] = [
  ServerJobStatus.RUNNING,
  ServerJobStatus.PENDING,
];

@Injectable()
export class ServersJobsFacade {
  private readonly logger = new Logger(ServersJobsFacade.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ServersJobsService,
    private readonly ssh: ServersConnectionService,
    private readonly detection: ServersDetectionService,
    private readonly audit: ServersAuditService,
  ) {}

  /**
   * Batch-loads the latest active (RUNNING/PENDING) job per server.
   */
  async loadActiveJobs(
    serverIds: string[],
  ): Promise<Map<string, ServerActiveJob>> {
    const result = new Map<string, ServerActiveJob>();
    if (serverIds.length === 0) return result;

    const jobRows = await this.prisma.serverJob.findMany({
      where: {
        serverId: { in: serverIds },
        status: { in: ACTIVE_JOB_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        serverId: true,
        type: true,
        status: true,
        startedAt: true,
        createdAt: true,
        error: true,
      },
    });

    for (const job of jobRows) {
      if (!result.has(job.serverId)) {
        result.set(job.serverId, {
          id: job.id,
          type: job.type,
          status: job.status,
          startedAt: job.startedAt,
          createdAt: job.createdAt,
          error: job.error,
        });
      }
    }

    return result;
  }

  async listJobs(
    id: string,
    pagination?: PaginationDto,
  ): Promise<ServerJobsListResult> {
    return this.jobs.listJobs(id, pagination);
  }

  async cancelJob(serverId: string, jobId: string) {
    return this.jobs.forceFailJob(serverId, jobId);
  }

  async retryJob(
    serverId: string,
    jobId: string,
    actorUserId?: string,
  ): Promise<ServerPublic> {
    const job = await this.prisma.serverJob.findFirst({
      where: { id: jobId, serverId },
    });
    if (!job) {
      throw new NotFoundException('Job serveur non trouvé');
    }

    const retryableStatuses: ServerJobStatus[] = [
      ServerJobStatus.FAILED,
      ServerJobStatus.TIMEOUT,
      ServerJobStatus.BLOCKED,
    ];
    if (!retryableStatuses.includes(job.status)) {
      throw new BadRequestException(
        'Seuls les jobs en échec (FAILED/TIMEOUT/BLOCKED) peuvent être relancés.',
      );
    }
    if (job.type !== ServerJobType.VERIFY) {
      throw new BadRequestException(
        `Le type de job "${job.type}" ne peut pas être relancé directement. ` +
          'Utilisez le bouton "Retry" de la préparation de serveur pour les setups.',
      );
    }

    return this.verifyServer(serverId, actorUserId);
  }

  async verifyServer(id: string, actorUserId?: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);

    if (
      server.onboardingStep === ServerOnboardingStep.PENDING &&
      !server.isVerified
    ) {
      throw new BadRequestException(
        'La clé SSH doit être installée sur le VPS avant la vérification. Utilisez l\u2019action "Install SSH key".',
      );
    }

    const job = await this.jobs.createJobAtomic(
      server.id,
      ServerJobType.VERIFY,
    );
    await this.audit.record(server.id, 'SERVER_VALIDATE_SSH', actorUserId, {
      jobId: job.id,
    });

    // Detection auto-triggers on a successful validation via the
    // SERVER_EVENTS.SSH_VALIDATED event (ServersDetectionService.onSshValidated,
    // emitted by ServersVerificationService.markSshValidated, which
    // verifyServerDirect() calls below) — no separate chaining needed here.
    // An earlier version of this method ALSO chained detection explicitly,
    // which ran detect() twice per validation (two SSH round-trips, two
    // concurrent writes to the same Server row). Removed — one trigger only.
    this.runJobInBackground(
      job.id,
      this.jobs.executeJobWithRetry(
        job,
        async (options) =>
          toPublicServer(await this.ssh.verifyServerDirect(server, options)),
        (error) => this.toErrorMessage(error),
      ),
    );

    return toPublicServer(server);
  }

  async detectServer(id: string, actorUserId?: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    return toPublicServer(await this.detection.detect(server, actorUserId));
  }

  async registerRunner(
    id: string,
    gitlabUrl: string,
    token: string,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const job = await this.jobs.createJobAtomic(
      server.id,
      ServerJobType.REGISTER_RUNNER,
      { gitlabUrl } satisfies RegisterRunnerPayload,
    );

    this.runJobInBackground(
      job.id,
      this.jobs.executeJobWithRetry(
        job,
        async (options) =>
          toPublicServer(
            await this.ssh.registerRunnerAndVerify(
              server,
              gitlabUrl,
              token,
              options,
            ),
          ),
        (error) => this.toErrorMessage(error),
      ),
    );

    return toPublicServer(server);
  }

  async installPublicKey(
    id: string,
    password: string,
    actorUserId?: string,
  ): Promise<{ success: true; message: string }> {
    const result = await this.ssh.installPublicKey(id, password);
    await this.audit.record(id, 'SERVER_INSTALL_SSH_KEY', actorUserId, {
      success: true,
    });

    // Clean onboarding: installing the key is only step 1. SSH validation and
    // capability detection are DISTINCT follow-ups that the user shouldn't have
    // to trigger by hand — chain them automatically so "add server" flows
    // NEW → KEY_INSTALLED → SSH_VALIDATED → INFO_DETECTED on its own.
    // verifyServer() itself fire-and-forgets the job and (on success)
    // auto-runs detection, so this is non-blocking; a failure only logs.
    this.verifyServer(id, actorUserId).catch((error: unknown) => {
      this.logger.warn(
        `Auto-validation after key install failed for server ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    return result;
  }

  async pingServer(
    id: string,
    _actorUserId: string,
  ): Promise<{ ok: boolean; message: string }> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException(`Serveur "${id}" non trouvé`);
    }

    // Synchronous lightweight reachability test (no job, no state mutation) —
    // previously this re-ran a full SSH validation job fire-and-forget and
    // returned the STALE isVerified read from before the job started.
    return this.ssh.pingDirect(server);
  }

  toErrorMessage(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof response.message === 'string'
      ) {
        return response.message;
      }
      return error.message;
    }
    if (error instanceof Error && error.message) return error.message;
    return 'Exécution distante échouée';
  }

  private runJobInBackground(jobId: string, task: Promise<unknown>): void {
    task.catch((error: unknown) => {
      this.logger.error(
        `Background job ${jobId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async getServerById(id: string): Promise<Server> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Serveur non trouvé');
    return server;
  }
}

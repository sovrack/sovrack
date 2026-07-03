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
import { ServerPreparationService } from '../../onboarding/services/infra-preparation.service';
import { ServersAuditService } from './servers-audit.service';
import { ServersVerificationService } from './servers-verification.service';
import { InstallToolsDto } from '../dto/install-tools.dto';
import { PrepareServerDto } from '../dto/prepare-server.dto';
import { StartServerPreparationDto } from '../dto/start-server-preparation.dto';
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
    private readonly preparation: ServerPreparationService,
    private readonly audit: ServersAuditService,
    private readonly verification: ServersVerificationService,
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

  async retryJob(id: string, jobId: string): Promise<ServerPublic> {
    return this.jobs.retryJob(id, jobId, {
      verify: async () => this.verifyServer(id),
      install: async (payload) => this.installTools(id, payload),
      prepare: async (payload) => this.prepareServer(id, payload),
    });
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

  async installTools(
    id: string,
    tools?: InstallToolsDto,
  ): Promise<ServerPublic> {
    const payload: StartServerPreparationDto = {
      docker: tools?.docker ?? true,
      dockerComposePlugin: tools?.docker ?? true,
      gitlabRunner: tools?.runner ?? false,
      systemUpdate: true,
      securityHardening: true,
      logrotate: true,
    };
    return this.prepareServer(id, payload);
  }

  async prepareServer(
    id: string,
    prepare?: PrepareServerDto | StartServerPreparationDto,
    actorUserId?: string,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    await this.preparation.startPreparation(server.id, prepare, actorUserId);
    return toPublicServer(server);
  }

  async startPreparation(
    id: string,
    prepare?: StartServerPreparationDto,
    actorUserId?: string,
  ) {
    const server = await this.getServerById(id);
    return this.preparation.startPreparation(server.id, prepare, actorUserId);
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
    return result;
  }

  async pingServer(
    id: string,
    actorUserId: string,
  ): Promise<{ ok: boolean; message: string }> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException(`Serveur "${id}" non trouvé`);
    }

    try {
      await this.verification.startVerification(id);
      const result = await this.verifyServer(id, actorUserId);
      return {
        ok: Boolean(result.isVerified),
        message: result.verificationError ?? 'Connexion SSH validée',
      };
    } catch (err) {
      return {
        ok: false,
        message: this.toErrorMessage(err),
      };
    }
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

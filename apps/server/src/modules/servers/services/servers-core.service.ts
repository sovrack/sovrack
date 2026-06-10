import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Server,
  ServerConnectionMode,
  ServerJobStatus,
  ServerJobType,
  ServerStatus,
} from '@prisma/client';
import { PaginationDto, paginate } from '../../../core/http/pagination.dto';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  CreateServerDto,
  ServerConnectionModeDto,
} from '../dto/create-server.dto';
import { UpdateServerDto } from '../dto/update-server.dto';
import { ServersCryptoService } from './servers-crypto.service';
import { ServersJobsService } from './servers-jobs.service';
import { ServersConnectionService } from './servers-connection.service';
import { InstallToolsDto } from '../dto/install-tools.dto';
import { PrepareServerDto } from '../dto/prepare-server.dto';
import { StartServerPreparationDto } from '../dto/start-server-preparation.dto';
import { ServersDetectionService } from './servers-detection.service';
import { ServerPreparationService } from '../../infrastructure/services/infra-preparation.service';
import { ServerVerificationService } from './server-verification.service';
import { ServersAuditService } from './servers-audit.service';
import { AuditService } from '../../audit/audit.service';
import type { ServerInfraRole } from '@prisma/client';
import {
  CreateServerResult,
  ServerActiveJob,
  ServerJobsListResult,
  ServerListResult,
  RegisterRunnerPayload,
  ServerPublic,
} from '../shared/servers.types';

const ACTIVE_JOB_STATUSES: ServerJobStatus[] = [
  ServerJobStatus.RUNNING,
  ServerJobStatus.PENDING,
  ServerJobStatus.BLOCKED,
];

@Injectable()
export class ServersCoreService {
  private readonly logger = new Logger(ServersCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ServersCryptoService,
    private readonly ssh: ServersConnectionService,
    private readonly jobs: ServersJobsService,
    private readonly detection: ServersDetectionService,
    private readonly preparation: ServerPreparationService,
    private readonly verification: ServerVerificationService,
    private readonly audit: ServersAuditService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateServerDto,
    actorUserId: string,
  ): Promise<CreateServerResult> {
    const connectionMode = this.ssh.mapConnectionMode(dto.connectionMode);

    let resolvedSshKey: string | undefined = dto.sshKey;
    if (dto.sshKeyId && !resolvedSshKey) {
      const stored = await this.prisma.sshKey.findUnique({
        where: { id: dto.sshKeyId },
      });
      if (!stored) {
        throw new BadRequestException(`SSH key "${dto.sshKeyId}" introuvable`);
      }
      resolvedSshKey = this.crypto.decrypt(stored.encryptedPrivateKey);
    }

    const sshMaterial = this.crypto.resolveSshMaterial(resolvedSshKey);
    const onboardingStep = this.resolveOnboardingStep({
      isVerified: false,
      hasDocker: false,
      hasRunner: false,
      // Le serveur est toujours créé en étape PENDING:
      // la clé publique doit être installée explicitement via install-key.
      hasSshKeyInstalled: false,
    });

    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port ?? 22,
        username: dto.username ?? 'ubuntu',
        sshKey: this.crypto.encrypt(sshMaterial.privateKey),
        sshPublicKey: sshMaterial.publicKey,
        connectionMode,
        onboardingStep,
        status: ServerStatus.NEW,
      },
    });

    await this.auditService.record(actorUserId, 'SERVER_CREATE', 'Server', server.id, {
      name: server.name,
      host: server.host,
      connectionMode: server.connectionMode,
    });
    await this.audit.record(server.id, 'SERVER_CREATE', actorUserId, {
      name: server.name,
      host: server.host,
      connectionMode: server.connectionMode,
    });

    return this.toPublic(server);
  }

  async findAll(pagination?: PaginationDto): Promise<ServerListResult> {
    if (!pagination?.page || !pagination?.limit) {
      const servers = await this.prisma.server.findMany({
        orderBy: { createdAt: 'desc' },
      });
      const activeJobs = await this.loadActiveJobs(servers.map((s) => s.id));
      return servers.map((server) =>
        this.toPublic(server, activeJobs.get(server.id) ?? null),
      );
    }

    const page = pagination.page;
    const limit = pagination.limit;
    const skip = (page - 1) * limit;

    const [servers, total] = await Promise.all([
      this.prisma.server.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.server.count(),
    ]);

    const activeJobs = await this.loadActiveJobs(servers.map((s) => s.id));

    return paginate(
      servers.map((server) =>
        this.toPublic(server, activeJobs.get(server.id) ?? null),
      ),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const activeJobs = await this.loadActiveJobs([id]);
    return this.toPublic(server, activeJobs.get(id) ?? null);
  }

  /**
   * Batch-loads the latest active (RUNNING/PENDING/BLOCKED) job per server so
   * the servers list response carries lock state without the client polling
   * `GET /servers/:id/jobs` separately for each server.
   */
  private async loadActiveJobs(
    serverIds: string[],
  ): Promise<Map<string, ServerActiveJob>> {
    const result = new Map<string, ServerActiveJob>();
    if (serverIds.length === 0) {
      return result;
    }

    const jobs = await this.prisma.serverJob.findMany({
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

    for (const job of jobs) {
      // findMany is ordered desc, so the first job seen per server is the latest
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

  async update(
    id: string,
    dto: UpdateServerDto,
    actorUserId: string,
  ): Promise<ServerPublic> {
    const existing = await this.getServerById(id);

    const nextConnectionMode =
      dto.connectionMode !== undefined
        ? this.ssh.mapConnectionMode(dto.connectionMode)
        : existing.connectionMode;

    const resetVerification =
      dto.host !== undefined ||
      dto.port !== undefined ||
      dto.username !== undefined ||
      dto.sshKey !== undefined ||
      dto.connectionMode !== undefined;

    const resetOnboardingStep = this.resolveOnboardingStep({
      isVerified: false,
      hasDocker: false,
      hasRunner: false,
      hasSshKeyInstalled: false,
    });

    const data: Prisma.ServerUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.host !== undefined && { host: dto.host }),
      ...(dto.port !== undefined && { port: dto.port }),
      ...(dto.username !== undefined && { username: dto.username }),
      ...(dto.sshKey !== undefined && {
        sshKey: this.crypto.encrypt(
          this.crypto.normalizePrivateKeyFormat(dto.sshKey),
        ),
      }),
      ...(dto.connectionMode !== undefined && {
        connectionMode: nextConnectionMode,
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.isVerified !== undefined && { isVerified: dto.isVerified }),
      ...(dto.hasDocker !== undefined && { hasDocker: dto.hasDocker }),
      ...(dto.hasRunner !== undefined && { hasRunner: dto.hasRunner }),
      ...(resetVerification && {
        isVerified: false,
        hasDocker: false,
        hasRunner: false,
        status: ServerStatus.NEW,
        onboardingStep: resetOnboardingStep,
      }),
      ...(!resetVerification &&
        (dto.isVerified !== undefined ||
          dto.hasDocker !== undefined ||
          dto.hasRunner !== undefined) && {
          onboardingStep: this.resolveOnboardingStep({
            isVerified: dto.isVerified ?? existing.isVerified,
            hasDocker: dto.hasDocker ?? existing.hasDocker,
            hasRunner: dto.hasRunner ?? existing.hasRunner,
            hasSshKeyInstalled:
              existing.onboardingStep !== 'PENDING' ||
              (dto.isVerified ?? false),
          }),
        }),
    };

    const updated = await this.prisma.server.update({
      where: { id },
      data,
    });

    await this.auditService.record(actorUserId, 'SERVER_UPDATE', 'Server', updated.id, {
      changedFields: Object.keys(dto),
    });
    await this.audit.record(updated.id, 'SERVER_EDIT', actorUserId, {
      changedFields: Object.keys(dto),
    });

    return this.toPublic(updated);
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    await this.getServerById(id);

    const activeEnvCount = await this.prisma.environment.count({
      where: {
        serverId: id,
        isActive: true,
      },
    });

    if (activeEnvCount > 0) {
      throw new BadRequestException(
        'Suppression impossible: ce serveur a des environnements actifs',
      );
    }

    await this.prisma.server.delete({ where: { id } });
    await this.auditService.record(actorUserId, 'SERVER_DELETE', 'Server', id);
  }

  async listJobs(
    id: string,
    pagination?: PaginationDto,
  ): Promise<ServerJobsListResult> {
    return await this.jobs.listJobs(id, pagination);
  }

  async cancelJob(serverId: string, jobId: string) {
    return await this.jobs.forceFailJob(serverId, jobId);
  }

  async retryJob(id: string, jobId: string): Promise<ServerPublic> {
    return await this.jobs.retryJob(id, jobId, {
      verify: async () => await this.verifyServer(id),
      install: async (payload) => await this.installTools(id, payload),
      prepare: async (payload) => await this.prepareServer(id, payload),
    });
  }

  async verifyServer(id: string, actorUserId?: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);

    if (server.onboardingStep === 'PENDING' && !server.isVerified) {
      throw new BadRequestException(
        'La clé SSH doit être installée sur le VPS avant la vérification. Utilisez l’action "Install SSH key".',
      );
    }

    await this.jobs.assertNoActiveJob(server.id);
    const job = await this.jobs.createJob(server.id, ServerJobType.VERIFY);
    await this.audit.record(server.id, 'SERVER_VALIDATE_SSH', actorUserId, {
      jobId: job.id,
    });

    this.runJobInBackground(
      job.id,
      this.jobs.executeJobWithRetry(
        job,
        async (options) =>
          this.toPublic(await this.ssh.verifyServerDirect(server, options)),
        (error) => this.toErrorMessage(error),
      ),
    );

    return this.toPublic(server);
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

    return await this.prepareServer(id, payload);
  }

  async prepareServer(
    id: string,
    prepare?: PrepareServerDto | StartServerPreparationDto,
    actorUserId?: string,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    await this.preparation.startPreparation(server.id, prepare, actorUserId);
    return this.toPublic(server);
  }

  async startPreparation(
    id: string,
    prepare?: StartServerPreparationDto,
    actorUserId?: string,
  ) {
    const server = await this.getServerById(id);
    return await this.preparation.startPreparation(
      server.id,
      prepare,
      actorUserId,
    );
  }

  async detectServer(id: string, actorUserId?: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    return this.toPublic(await this.detection.detect(server, actorUserId));
  }

  async listAuditEvents(id: string) {
    await this.getServerById(id);
    return await this.audit.list(id);
  }

  async listCapabilities(id: string) {
    await this.getServerById(id);
    return await this.detection.listCapabilities(id);
  }

  async listInstalledTools(id: string) {
    await this.getServerById(id);
    return await this.detection.listInstalledTools(id);
  }

  async listValidationResults(id: string) {
    await this.getServerById(id);
    return await this.verification.listValidationResults(id);
  }

  async listPreparations(id: string) {
    await this.getServerById(id);
    return await this.preparation.listPreparations(id);
  }

  async getPreparationReadiness(id: string) {
    await this.getServerById(id);
    return await this.preparation.getPreparationReadiness(id);
  }

  async registerRunner(
    id: string,
    gitlabUrl: string,
    token: string,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    await this.jobs.assertNoActiveJob(server.id);
    const job = await this.jobs.createJob(
      server.id,
      ServerJobType.REGISTER_RUNNER,
      { gitlabUrl } satisfies RegisterRunnerPayload,
    );

    this.runJobInBackground(
      job.id,
      this.jobs.executeJobWithRetry(
        job,
        async (options) =>
          this.toPublic(
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

    return this.toPublic(server);
  }

  private runJobInBackground(jobId: string, task: Promise<unknown>): void {
    task.catch((error: unknown) => {
      this.logger.error(
        `Background job ${jobId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
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

  toErrorMessage(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
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

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Exécution distante échouée';
  }

  private toConnectionModeDto(
    mode: ServerConnectionMode,
  ): ServerConnectionModeDto {
    if (mode === ServerConnectionMode.SSH) {
      return ServerConnectionModeDto.SSH;
    }
    return ServerConnectionModeDto.SSH;
  }

  private async getServerById(id: string): Promise<Server> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }
    return server;
  }

  private resolveOnboardingStep(input: {
    isVerified: boolean;
    hasDocker: boolean;
    hasRunner: boolean;
    hasSshKeyInstalled: boolean;
  }): string {
    if (input.isVerified && input.hasDocker && input.hasRunner) {
      return 'READY';
    }

    if (input.isVerified) {
      return 'VALIDATED';
    }

    if (!input.hasSshKeyInstalled) {
      return 'PENDING';
    }

    return 'KEY_INSTALLED';
  }

  private toPublic(
    server: Server,
    activeJob: ServerActiveJob | null = null,
  ): ServerPublic {
    const { sshKey, ...publicServer } = server;
    void sshKey;
    return {
      ...publicServer,
      connectionMode: this.toConnectionModeDto(server.connectionMode),
      activeJob,
    };
  }

  // ─── Delegations vers ServerPreparationService ────────────────────────────

  getPreparationOptions() {
    return this.preparation.getOptions();
  }

  async getPreparation(id: string) {
    return await this.preparation.getPreparation(id);
  }

  async getPreparationLogs(id: string, afterLine?: number) {
    return await this.preparation.getPreparationLogs(id, afterLine);
  }

  async retryPreparation(
    id: string,
    dto: Parameters<ServerPreparationService['retryPreparation']>[1],
    actorId: string,
  ) {
    return await this.preparation.retryPreparation(id, dto, actorId);
  }

  async cancelPreparation(id: string, actorId: string) {
    return await this.preparation.cancelPreparation(id, actorId);
  }

  // ─── Delegations vers ServerVerificationService ──────────────────────────

  async resetVerificationStatus(id: string) {
    return await this.verification.resetStatus(id);
  }

  async getRecentVerificationLogs(id: string, limit = 50) {
    return await this.verification.getRecentLogs(id, limit);
  }

  // ─── Infrastructure roles & environments ─────────────────────────────────

  async setServerInfraRole(
    id: string,
    infraRole: ServerInfraRole,
    actorUserId: string,
  ): Promise<ServerPublic> {
    const existing = await this.prisma.server.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Serveur "${id}" non trouvé`);
    }

    const updated = await this.prisma.server.update({
      where: { id },
      data: { infraRole } as Prisma.ServerUpdateInput,
    });

    await this.auditService.record(actorUserId, 'SERVER_SET_INFRA_ROLE', 'Server', updated.id, {
      infraRole,
    });

    return this.toPublic(updated);
  }

  async listInfraEnvironments(): Promise<ServerPublic[]> {
    const servers = await this.prisma.server.findMany({
      where: {
        infraRole: { in: ['STAGING', 'PRODUCTION'] as ServerInfraRole[] },
      } as Prisma.ServerWhereInput,
      orderBy: { name: 'asc' },
    });
    return servers.map((server) => this.toPublic(server));
  }

  async listEnvironmentsForServer(id: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException(`Serveur "${id}" non trouvé`);
    }
    return await this.prisma.environment.findMany({
      where: { serverId: id },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Ping (test SSH rapide) ───────────────────────────────────────────────

  async pingServer(id: string, actorUserId: string): Promise<{ ok: boolean; message: string }> {
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
}

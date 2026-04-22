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
  ServerJobType,
} from '@prisma/client';
import { PaginationDto, paginate } from '../../../common/dto/pagination.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateServerDto,
  ServerConnectionModeDto,
} from '../dto/create-server.dto';
import { UpdateServerDto } from '../dto/update-server.dto';
import { ServersAnsibleService } from './servers-ansible.service';
import { ServersCryptoService } from './servers-crypto.service';
import { ServersJobsService } from './servers-jobs.service';
import { ServersSshService } from './servers-ssh.service';
import { InstallToolsDto } from '../dto/install-tools.dto';
import {
  CreateServerResult,
  ServerJobsListResult,
  ServerListResult,
  RegisterRunnerPayload,
  ServerPublic,
} from '../shared/servers.types';

@Injectable()
export class ServersCoreService {
  private readonly logger = new Logger(ServersCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ServersCryptoService,
    private readonly ssh: ServersSshService,
    private readonly ansible: ServersAnsibleService,
    private readonly jobs: ServersJobsService,
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
      hasAnsible: false,
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
      },
    });

    await this.recordAuditLog(actorUserId, 'SERVER_CREATE', server.id, {
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
      return servers.map((server) => this.toPublic(server));
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

    return paginate(
      servers.map((server) => this.toPublic(server)),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    return this.toPublic(server);
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
      hasAnsible: false,
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
      ...(dto.hasAnsible !== undefined && { hasAnsible: dto.hasAnsible }),
      ...(dto.hasRunner !== undefined && { hasRunner: dto.hasRunner }),
      ...(resetVerification && {
        isVerified: false,
        hasDocker: false,
        hasAnsible: false,
        hasRunner: false,
        onboardingStep: resetOnboardingStep,
      }),
      ...(!resetVerification &&
        (dto.isVerified !== undefined ||
          dto.hasDocker !== undefined ||
          dto.hasAnsible !== undefined ||
          dto.hasRunner !== undefined) && {
          onboardingStep: this.resolveOnboardingStep({
            isVerified: dto.isVerified ?? existing.isVerified,
            hasDocker: dto.hasDocker ?? existing.hasDocker,
            hasAnsible: dto.hasAnsible ?? existing.hasAnsible,
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

    await this.recordAuditLog(actorUserId, 'SERVER_UPDATE', updated.id, {
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
    await this.recordAuditLog(actorUserId, 'SERVER_DELETE', id);
  }

  async listJobs(
    id: string,
    pagination?: PaginationDto,
  ): Promise<ServerJobsListResult> {
    return await this.jobs.listJobs(id, pagination);
  }

  async retryJob(id: string, jobId: string): Promise<ServerPublic> {
    return await this.jobs.retryJob(id, jobId, {
      verify: async () => await this.verifyServer(id),
      install: async (payload) => await this.installTools(id, payload),
    });
  }

  async verifyServer(id: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);

    if (server.onboardingStep === 'PENDING' && !server.isVerified) {
      throw new BadRequestException(
        'La clé SSH doit être installée sur le VPS avant la vérification. Utilisez l’action "Install SSH key".',
      );
    }

    const job = await this.jobs.createJob(server.id, ServerJobType.VERIFY);

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
    const server = await this.getServerById(id);
    const payload: InstallToolsDto = {
      docker: tools?.docker ?? true,
      ansible: tools?.ansible ?? true,
      runner: tools?.runner ?? true,
    };

    const job = await this.jobs.createJob(
      server.id,
      ServerJobType.INSTALL_TOOLS,
      payload,
    );

    this.runJobInBackground(
      job.id,
      this.jobs.executeJobWithRetry(
        job,
        async (options) =>
          this.toPublic(
            await this.ansible.installToolsDirect(server, payload, options),
          ),
        (error) => this.toErrorMessage(error),
      ),
    );

    return this.toPublic(server);
  }

  async registerRunner(
    id: string,
    gitlabUrl: string,
    token: string,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
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
  ): Promise<{ success: true; message: string }> {
    return await this.ssh.installPublicKey(id, password);
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
    hasAnsible: boolean;
    hasRunner: boolean;
    hasSshKeyInstalled: boolean;
  }): string {
    if (
      input.isVerified &&
      input.hasDocker &&
      input.hasAnsible &&
      input.hasRunner
    ) {
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

  private toPublic(server: Server): ServerPublic {
    const { sshKey, ...publicServer } = server;
    void sshKey;
    return {
      ...publicServer,
      connectionMode: this.toConnectionModeDto(server.connectionMode),
    };
  }

  private async recordAuditLog(
    userId: string,
    action: string,
    resourceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          resourceType: 'Server',
          resourceId,
          ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
        },
      });
    } catch {
      // Le journal d'audit reste non bloquant.
    }
  }
}

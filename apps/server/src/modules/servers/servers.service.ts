import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Server,
  ServerConnectionMode,
  ServerJobType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateServerDto,
  ServerConnectionModeDto,
  ServerVerificationMode,
} from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { ServersAnsibleService } from './servers-ansible.service';
import { ServersCryptoService } from './servers-crypto.service';
import { ServersJobsService } from './servers-jobs.service';
import { ServersRunnerService } from './servers-runner.service';
import { ServersSshService } from './servers-ssh.service';
import {
  CreateServerResult,
  InstallToolsDto,
  RegisterRunnerPayload,
  ServerPublic,
} from './servers.types';

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ServersCryptoService,
    private readonly ssh: ServersSshService,
    private readonly ansible: ServersAnsibleService,
    private readonly jobs: ServersJobsService,
    private readonly runner: ServersRunnerService,
  ) {}

  async create(
    dto: CreateServerDto,
    actorUserId: string,
  ): Promise<CreateServerResult> {
    const connectionMode = this.ssh.mapConnectionMode(dto.connectionMode);
    const sshMaterial = this.crypto.resolveSshMaterial();

    if (connectionMode === ServerConnectionMode.BASTION) {
      this.ssh.assertBastionConfig(
        dto.bastionHost,
        dto.bastionUsername,
        dto.bastionSshKey,
      );
    }

    const agentBootstrapToken =
      connectionMode === ServerConnectionMode.AGENT
        ? randomBytes(24).toString('hex')
        : undefined;

    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port ?? 22,
        username: dto.username ?? 'ubuntu',
        sshKey: this.crypto.encrypt(sshMaterial.privateKey),
        sshPublicKey: sshMaterial.publicKey,
        connectionMode,
        bastionHost: dto.bastionHost,
        bastionPort: dto.bastionPort,
        bastionUsername: dto.bastionUsername,
        bastionSshKey: dto.bastionSshKey
          ? this.crypto.encrypt(dto.bastionSshKey)
          : null,
        agentTokenHash: agentBootstrapToken
          ? this.crypto.hashToken(agentBootstrapToken)
          : null,
      },
    });

    await this.recordAuditLog(actorUserId, 'SERVER_CREATE', server.id, {
      name: server.name,
      host: server.host,
      connectionMode: server.connectionMode,
    });

    const verificationMode = dto.verificationMode ?? ServerVerificationMode.SSH;

    if (
      verificationMode === ServerVerificationMode.SSH &&
      connectionMode !== ServerConnectionMode.AGENT
    ) {
      try {
        const verified = await this.verifyServer(server.id);
        return {
          ...verified,
          ...(agentBootstrapToken && { agentBootstrapToken }),
        };
      } catch {
        // La création ne doit pas échouer si la vérification auto échoue.
      }
    }

    return {
      ...this.toPublic(server),
      ...(agentBootstrapToken && { agentBootstrapToken }),
    };
  }

  async findAll(): Promise<ServerPublic[]> {
    const servers = await this.prisma.server.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return servers.map((server) => this.toPublic(server));
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

    if (nextConnectionMode === ServerConnectionMode.BASTION) {
      this.ssh.assertBastionConfig(
        dto.bastionHost ?? existing.bastionHost ?? undefined,
        dto.bastionUsername ?? existing.bastionUsername ?? undefined,
        dto.bastionSshKey ?? existing.bastionSshKey ?? undefined,
      );
    }

    const resetVerification =
      dto.host !== undefined ||
      dto.port !== undefined ||
      dto.username !== undefined ||
      dto.connectionMode !== undefined ||
      dto.bastionHost !== undefined ||
      dto.bastionPort !== undefined ||
      dto.bastionUsername !== undefined ||
      dto.bastionSshKey !== undefined;

    const data: Prisma.ServerUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.host !== undefined && { host: dto.host }),
      ...(dto.port !== undefined && { port: dto.port }),
      ...(dto.username !== undefined && { username: dto.username }),
      ...(dto.connectionMode !== undefined && {
        connectionMode: this.ssh.mapConnectionMode(dto.connectionMode),
      }),
      ...(dto.bastionHost !== undefined && {
        bastionHost: dto.bastionHost || null,
      }),
      ...(dto.bastionPort !== undefined && {
        bastionPort: dto.bastionPort || null,
      }),
      ...(dto.bastionUsername !== undefined && {
        bastionUsername: dto.bastionUsername || null,
      }),
      ...(dto.bastionSshKey !== undefined && {
        bastionSshKey: dto.bastionSshKey
          ? this.crypto.encrypt(dto.bastionSshKey)
          : null,
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

  async listJobs(id: string) {
    return await this.jobs.listJobs(id);
  }

  async retryJob(id: string, jobId: string): Promise<ServerPublic> {
    return await this.jobs.retryJob(id, jobId, {
      verify: async () => await this.verifyServer(id),
      install: async (payload) => await this.installTools(id, payload),
    });
  }

  async verifyServer(id: string): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const job = await this.jobs.createJob(server.id, ServerJobType.VERIFY);

    if (server.connectionMode === ServerConnectionMode.AGENT) {
      await this.jobs.markJobAgentPending(
        job.id,
        'Vérification en attente de l’agent',
      );
      return this.toPublic(server);
    }

    return await this.jobs.executeJobWithRetry(
      job,
      async () => this.toPublic(await this.ssh.verifyServerDirect(id)),
      (error) => this.toErrorMessage(error),
    );
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

    if (server.connectionMode === ServerConnectionMode.AGENT) {
      await this.jobs.markJobAgentPending(
        job.id,
        'Installation en attente de l’agent',
      );
      return this.toPublic(server);
    }

    return await this.jobs.executeJobWithRetry(
      job,
      async () => this.toPublic(await this.ansible.installToolsDirect(server, payload)),
      (error) => this.toErrorMessage(error),
    );
  }

  async registerRunner(
    id: string,
    gitlabUrl: string,
    token: string,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(id);
    const job = await this.jobs.createJob(server.id, ServerJobType.REGISTER_RUNNER, {
      gitlabUrl,
    } satisfies RegisterRunnerPayload);

    if (server.connectionMode === ServerConnectionMode.AGENT) {
      await this.jobs.markJobAgentPending(
        job.id,
        'Enregistrement runner en attente de l’agent',
      );
      return this.toPublic(server);
    }

    return await this.jobs.executeJobWithRetry(
      job,
      async () => this.toPublic(await this.runner.registerRunner(server, gitlabUrl, token)),
      (error) => this.toErrorMessage(error),
    );
  }

  async installPublicKey(
    id: string,
    password: string,
  ): Promise<{ success: true; message: string }> {
    return await this.ssh.installPublicKey(id, password);
  }

  assertSafeLinuxUsername(username: string): void {
    const safePattern = /^[a-z_][a-z0-9_-]{0,30}$/i;
    if (!safePattern.test(username)) {
      throw new BadRequestException(
        'Username SSH invalide: caractères non autorisés',
      );
    }
  }

  shellQuote(value: string): string {
    return `'${value.replace(/'/g, `"'"'`)}'`;
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

    if (mode === ServerConnectionMode.BASTION) {
      return ServerConnectionModeDto.BASTION;
    }

    return ServerConnectionModeDto.AGENT;
  }

  private async getServerById(id: string): Promise<Server> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }
    return server;
  }

  private toPublic(server: Server): ServerPublic {
    const { sshKey, bastionSshKey, agentTokenHash, ...publicServer } = server;
    void sshKey;
    void bastionSshKey;
    void agentTokenHash;
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

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ContainerStatus,
  Prisma,
  Server,
  ServerOnboardingStep,
  ServerStatus,
} from '@prisma/client';
import {
  PaginationDto,
  paginate,
} from '../../../../shared/http/pagination.dto';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { activeWhere } from '../../../../shared/database/prisma-active.helper';
import { CreateServerDto } from '../dto/create-server.dto';
import { UpdateServerDto } from '../dto/update-server.dto';
import { ServersCryptoService } from '../../../../adapters/ssh/servers-crypto.service';
import { ServersConnectionService } from './servers-connection.service';
import { ServersAuditService } from './servers-audit.service';
import { AuditService } from '../../../audit/audit.service';
import { UsageGuardService } from '../../../billing/usage-guard.service';
import { WorkspaceAccessService } from '../../../iam/authorization/workspace-access.service';
import { WorkspaceActions } from '../../../iam/authorization/workspace-policy.types';
import {
  CreateServerResult,
  ServerListResult,
  ServerPublic,
} from '../shared/servers.types';
import {
  serverHasDocker,
  serverHasRunner,
} from '../../../../adapters/server-capabilities/server-capabilities.util';
import { toPublicServer } from '../shared/server-public.util';
import { ServersJobsFacade } from './servers-jobs.facade';

/**
 * CRUD réel du serveur (create/findAll/findOne/update/remove), extrait de
 * ServersCoreService — voir EXPLORATION_BACKEND_DEPENDANCES.md section 1.
 * `jobsFacade` est nécessaire ICI (pas seulement pour le domaine JOBS) car
 * findAll/findOne enrichissent leur réponse avec les jobs actifs du serveur —
 * piège identifié par l'exploration, ne pas retirer cette dépendance.
 */
@Injectable()
export class ServersCrudService {
  private readonly logger = new Logger(ServersCrudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ServersCryptoService,
    private readonly ssh: ServersConnectionService,
    private readonly jobsFacade: ServersJobsFacade,
    private readonly audit: ServersAuditService,
    private readonly auditService: AuditService,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly usageGuard: UsageGuardService,
  ) {}

  async create(
    dto: CreateServerDto,
    actorUserId: string,
    requestedWorkspaceId?: string,
  ): Promise<CreateServerResult> {
    const teamId = await this.workspaceAccess.resolveWorkspaceId(
      actorUserId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      teamId,
      actorUserId,
      WorkspaceActions.MANAGE_SERVER,
    );
    await this.usageGuard.guardForTeam(teamId, 'ADD_SERVER');

    const connectionMode = this.ssh.mapConnectionMode(dto.connectionMode);

    let resolvedSshKey: string | undefined = dto.sshKey;
    if (dto.sshKeyId && !resolvedSshKey) {
      // Ownership: la clé SSH appartient à un utilisateur — un serveur de sa
      // propre team ne doit pas pouvoir référencer la clé d'un autre compte.
      const stored = await this.prisma.sshKey.findFirst({
        where: { id: dto.sshKeyId, teamId },
      });
      if (!stored) {
        throw new BadRequestException(
          `SSH key "${dto.sshKeyId}" introuvable pour cet utilisateur`,
        );
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
        teamId,
      },
    });

    await this.auditService.record(
      actorUserId,
      'SERVER_CREATE',
      'Server',
      server.id,
      {
        name: server.name,
        host: server.host,
        connectionMode: server.connectionMode,
      },
    );
    await this.audit.record(server.id, 'SERVER_CREATE', actorUserId, {
      name: server.name,
      host: server.host,
      connectionMode: server.connectionMode,
    });
    this.logger.log(
      `Server "${server.name}" (${server.id}) created at ${server.host}`,
    );

    return toPublicServer(server);
  }

  async findAll(
    pagination: PaginationDto | undefined,
    actorUserId: string,
    requestedWorkspaceId?: string,
  ): Promise<ServerListResult> {
    const teamId = await this.workspaceAccess.resolveWorkspaceId(
      actorUserId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      teamId,
      actorUserId,
      WorkspaceActions.READ_SERVER,
    );
    const where = activeWhere({ teamId });

    if (!pagination?.page || !pagination?.limit) {
      const servers = await this.prisma.server.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      const activeJobs = await this.jobsFacade.loadActiveJobs(
        servers.map((s) => s.id),
      );
      return servers.map((server) =>
        toPublicServer(server, activeJobs.get(server.id) ?? null),
      );
    }

    const page = pagination.page;
    const limit = pagination.limit;
    const skip = (page - 1) * limit;

    const [servers, total] = await Promise.all([
      this.prisma.server.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.server.count({ where }),
    ]);

    const activeJobs = await this.jobsFacade.loadActiveJobs(
      servers.map((s) => s.id),
    );

    return paginate(
      servers.map((server) =>
        toPublicServer(server, activeJobs.get(server.id) ?? null),
      ),
      total,
      page,
      limit,
    );
  }

  /**
   * A3: reachability snapshot for every active server, polled by the list
   * page every 30-60s — deliberately separate from isVerified/status
   * (last-validation/preparation results, only updated on explicit user
   * action) so the two can coexist without either overwriting the other.
   */
  async pingAll(
    actorUserId: string,
    requestedWorkspaceId?: string,
  ): Promise<Record<string, boolean>> {
    const teamId = await this.workspaceAccess.resolveWorkspaceId(
      actorUserId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      teamId,
      actorUserId,
      WorkspaceActions.READ_SERVER,
    );
    const servers = await this.prisma.server.findMany({
      where: activeWhere({ teamId }),
      select: { id: true, host: true, port: true },
    });
    const results = await Promise.all(
      servers.map(async (server) => {
        const reachable = await this.ssh.pingReachable(
          server.host,
          server.port,
        );
        return [server.id, reachable] as const;
      }),
    );
    return Object.fromEntries(results);
  }

  async findOne(
    id: string,
    actorUserId: string,
    requestedWorkspaceId?: string,
  ): Promise<ServerPublic> {
    const server = await this.getServerById(
      id,
      actorUserId,
      WorkspaceActions.READ_SERVER,
      requestedWorkspaceId,
    );
    const activeJobs = await this.jobsFacade.loadActiveJobs([id]);
    return toPublicServer(server, activeJobs.get(id) ?? null);
  }

  async update(
    id: string,
    dto: UpdateServerDto,
    actorUserId: string,
    requestedWorkspaceId?: string,
  ): Promise<ServerPublic> {
    const existing = await this.getServerById(
      id,
      actorUserId,
      WorkspaceActions.MANAGE_SERVER,
      requestedWorkspaceId,
    );

    const nextConnectionMode =
      dto.connectionMode !== undefined
        ? this.ssh.mapConnectionMode(dto.connectionMode)
        : existing.connectionMode;

    // Same resolution as create(): an explicit raw `sshKey` wins over
    // `sshKeyId` (a reference to an existing Settings → SSH Keys entry).
    let resolvedSshKey: string | undefined = dto.sshKey;
    if (dto.sshKeyId && !resolvedSshKey) {
      // Ownership: même règle qu'en create() — la clé doit appartenir à l'auteur.
      const stored = await this.prisma.sshKey.findFirst({
        where: { id: dto.sshKeyId, teamId: existing.teamId },
      });
      if (!stored) {
        throw new BadRequestException(
          `SSH key "${dto.sshKeyId}" introuvable pour cet utilisateur`,
        );
      }
      resolvedSshKey = this.crypto.decrypt(stored.encryptedPrivateKey);
    }
    // resolveSshMaterial (not just normalizePrivateKeyFormat) so the stored
    // sshPublicKey is re-derived alongside the new private key — leaving it
    // stale would silently break ServerKeyInstallDialog (it displays
    // Server.sshPublicKey for the user to install on the remote host).
    const sshMaterial = resolvedSshKey
      ? this.crypto.resolveSshMaterial(resolvedSshKey)
      : undefined;

    const resetVerification =
      dto.host !== undefined ||
      dto.port !== undefined ||
      dto.username !== undefined ||
      sshMaterial !== undefined ||
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
      ...(sshMaterial !== undefined && {
        sshKey: this.crypto.encrypt(sshMaterial.privateKey),
        sshPublicKey: sshMaterial.publicKey,
      }),
      ...(dto.connectionMode !== undefined && {
        connectionMode: nextConnectionMode,
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.isVerified !== undefined && { isVerified: dto.isVerified }),
      ...(resetVerification && {
        isVerified: false,
        status: ServerStatus.NEW,
        onboardingStep: resetOnboardingStep,
      }),
      ...(!resetVerification &&
        dto.isVerified !== undefined && {
          onboardingStep: this.resolveOnboardingStep({
            isVerified: dto.isVerified ?? existing.isVerified,
            hasDocker: serverHasDocker(existing),
            hasRunner: serverHasRunner(existing),
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

    await this.auditService.record(
      actorUserId,
      'SERVER_UPDATE',
      'Server',
      updated.id,
      {
        changedFields: Object.keys(dto),
      },
    );
    await this.audit.record(updated.id, 'SERVER_EDIT', actorUserId, {
      changedFields: Object.keys(dto),
    });

    return toPublicServer(updated);
  }

  async remove(
    id: string,
    actorUserId: string,
    requestedWorkspaceId?: string,
  ): Promise<void> {
    const server = await this.getServerById(
      id,
      actorUserId,
      WorkspaceActions.MANAGE_SERVER,
      requestedWorkspaceId,
    );

    // Guard against orphaning an environment: deployments target
    // `environment.servers[0]`, so if this is the LAST active server of its
    // environment, deleting it would silently make that environment
    // undeployable ("Aucun serveur cible"). Block and tell the admin to attach
    // another server first, rather than fail at the next deploy.
    if (server.environmentId) {
      const otherActiveServers = await this.prisma.server.count({
        where: {
          environmentId: server.environmentId,
          archivedAt: null,
          id: { not: id },
        },
      });
      if (otherActiveServers === 0) {
        const env = await this.prisma.environment.findUnique({
          where: { id: server.environmentId },
          select: { name: true },
        });
        throw new BadRequestException(
          `Ce serveur est le seul de l'environnement « ${env?.name ?? server.environmentId} ». Le supprimer rendrait cet environnement non déployable. Attachez un autre serveur à cet environnement avant de le supprimer.`,
        );
      }
    }

    // Soft-delete: archive the server and mark its tracked containers EXITED so
    // logs, preparations and audit history survive (a hard DELETE would cascade
    // them away). The server disappears from listings but stays referenceable.
    // Suffix the name so it can be reused for a fresh server registration.
    // Also unlink it from its environment and mark it inactive so it can NEVER
    // be selected as a deploy target again (the deploy query filters on
    // isActive, not archivedAt).
    await this.prisma.$transaction([
      this.prisma.container.updateMany({
        where: { serverId: id },
        data: { status: ContainerStatus.EXITED },
      }),
      this.prisma.server.update({
        where: { id },
        data: {
          name: `${server.name}_archived_${Date.now()}`,
          archivedAt: new Date(),
          isActive: false,
          environmentId: null,
        },
      }),
    ]);
    await this.auditService.record(actorUserId, 'SERVER_DELETE', 'Server', id);
    this.logger.warn(`Server "${server.name}" (${id}) archived/removed`);
  }

  private async getServerById(
    id: string,
    actorUserId: string,
    action:
      | typeof WorkspaceActions.READ_SERVER
      | typeof WorkspaceActions.MANAGE_SERVER,
    requestedWorkspaceId?: string,
  ): Promise<Server> {
    const server = await this.prisma.server.findUnique({
      where: { id },
    });
    if (!server) throw new NotFoundException('Serveur non trouvé');
    if (requestedWorkspaceId && server.teamId !== requestedWorkspaceId) {
      throw new NotFoundException('Serveur non trouvé');
    }
    await this.workspaceAccess.assertWorkspaceAction(
      server.teamId,
      actorUserId,
      action,
    );
    return server;
  }

  private resolveOnboardingStep(input: {
    isVerified: boolean;
    hasDocker: boolean;
    hasRunner: boolean;
    hasSshKeyInstalled: boolean;
  }): ServerOnboardingStep {
    if (input.isVerified && input.hasDocker && input.hasRunner) {
      return ServerOnboardingStep.READY;
    }
    if (input.isVerified) {
      return ServerOnboardingStep.SSH_VALIDATED;
    }
    if (!input.hasSshKeyInstalled) {
      return ServerOnboardingStep.PENDING;
    }
    return ServerOnboardingStep.KEY_INSTALLED;
  }
}

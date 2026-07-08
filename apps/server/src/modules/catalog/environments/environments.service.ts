import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ACTIVE_FILTER } from '../../../shared/database/prisma-active.helper';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { ServiceEnvironmentsService } from '../service-environments/service-environments.service';
import { ProjectAccessService } from '../authorization/project-access.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

const environmentsInclude = {
  // Explicit `select` (not `include`) on serviceLinks itself — same fix as
  // ServicesService.serviceInclude (AUDIT_VERIFICATION_UI.md Point 0/Task 2):
  // an `include` with no `select` on the ServiceEnvironment relation returns
  // ALL of its scalar columns, including `env` (plaintext) and `secretsEnv`
  // (encrypted blob), neither of which the frontend reads off this list route
  // (it fetches variables via the dedicated service-environments/env-preview
  // endpoints instead).
  serviceLinks: {
    // Hide soft-deleted links: a "removed" service is renamed
    // `<name>_archived_<ts>` + archivedAt set (never hard-deleted, to keep
    // deploy/build history). Without this filter those archived rows still
    // showed up in the Project environments dialog. Excludes both an archived
    // link AND a link pointing at an archived Service.
    where: {
      archivedAt: null,
      service: { archivedAt: null },
    },
    select: {
      id: true,
      serviceId: true,
      environmentId: true,
      service: {
        select: {
          id: true,
          name: true,
          type: true,
          env: true,
          repoPath: true,
          branch: true,
          buildPack: true,
          port: true,
          sourceType: true,
        },
      },
      deployments: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: {
          id: true,
          status: true,
          branch: true,
          createdAt: true,
          finishedAt: true,
          user: { select: { fullName: true } },
        },
      },
    },
  },
  servers: {
    select: {
      id: true,
      name: true,
      host: true,
      isVerified: true,
      // C2 (page service): indicateur de santé par option du sélecteur
      // d'environnement — status inclut déjà UNREACHABLE/DISABLED etc.
      status: true,
    },
  },
} satisfies Prisma.EnvironmentInclude;

// secretsEnv is omitted from every read: like Service/ServiceEnvironment, the
// encrypted environment secrets are never returned to the client. They are
// only decrypted at deploy time (deployment-env.service → crypto.decryptSafe).
type EnvironmentWithRelations = Prisma.EnvironmentGetPayload<{
  include: typeof environmentsInclude;
  omit: { secretsEnv: true };
}>;

@Injectable()
export class EnvironmentsService {
  private readonly logger = new Logger(EnvironmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceEnvsService: ServiceEnvironmentsService,
    private readonly crypto: CryptoService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async create(
    projectId: string,
    dto: CreateEnvironmentDto,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithRelations> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );

    const env = await this.prisma.environment.create({
      data: {
        name: dto.name,
        projectId,
        env: dto.env,
        // Secrets de l'environnement chiffrés au repos (AES-256-GCM), comme
        // ServiceEnvironment.secretsEnv. Déchiffrés au déploiement (decryptSafe).
        // encryptOptional : une chaîne vide efface le secret (null) au lieu de
        // chiffrer une chaîne vide — même sémantique que ServicesService.create.
        secretsEnv:
          dto.secretsEnv !== undefined
            ? this.crypto.encryptOptional(dto.secretsEnv)
            : undefined,
      },
      include: environmentsInclude,
    });

    // Invariant service↔env : on lie automatiquement tous les services actifs du
    // projet à ce nouvel environnement (même symétrie qu'à la création d'un service
    // dans ServicesService.create → linkServiceToAllEnvs). Non-bloquant : un échec
    // de liaison ne doit pas empêcher la création de l'environnement.
    await this.serviceEnvsService
      .linkServiceToAllEnvsForEnvironment(env.id, projectId, userId, userRole)
      .catch((err: unknown) => {
        this.logger.warn(
          `linkServiceToAllEnvsForEnvironment failed for env ${env.id} (non-fatal): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    return this.findOne(projectId, env.id, userId, userRole);
  }

  async findAll(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithRelations[]> {
    await this.projectAccess.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );

    return await this.prisma.environment.findMany({
      where: { projectId, ...ACTIVE_FILTER },
      orderBy: { createdAt: 'asc' },
      omit: { secretsEnv: true },
      include: environmentsInclude,
    });
  }

  async findOne(
    projectId: string,
    envId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithRelations> {
    await this.projectAccess.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );

    const env = await this.prisma.environment.findFirst({
      where: { id: envId, projectId, ...ACTIVE_FILTER },
      omit: { secretsEnv: true },
      include: environmentsInclude,
    });

    if (!env) {
      throw new NotFoundException('Environnement non trouvé');
    }

    return env;
  }

  async update(
    projectId: string,
    envId: string,
    dto: UpdateEnvironmentDto,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithRelations> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    await this.ensureEnvironmentExists(projectId, envId);

    return await this.prisma.environment.update({
      where: { id: envId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.env !== undefined ? { env: dto.env } : {}),
        // '' clears the secret (encryptOptional → null) instead of encrypting
        // an empty string — same semantics as ServicesService.update.
        ...(dto.secretsEnv !== undefined
          ? { secretsEnv: this.crypto.encryptOptional(dto.secretsEnv) }
          : {}),
      },
      omit: { secretsEnv: true },
      include: environmentsInclude,
    });
  }

  async remove(
    projectId: string,
    envId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    await this.ensureEnvironmentExists(projectId, envId);

    // Network integrity: a public domain must not keep routing to a service of
    // an archived environment — require detaching domains first (same guard as
    // ServiceEnvironmentsService.unlink).
    const activeDomains = await this.prisma.domain.count({
      where: { serviceEnv: { environmentId: envId } },
    });
    if (activeDomains > 0) {
      throw new ConflictException(
        `Impossible de supprimer : ${activeDomains} domaine(s) pointent encore vers un service de cet environnement. Détachez-les d'abord.`,
      );
    }

    const env = await this.prisma.environment.findUnique({
      where: { id: envId },
      select: { name: true },
    });

    // Soft-delete (NOT a hard delete): Deployment.environment is a REQUIRED
    // relation with onDelete: Cascade, so a hard delete would destroy the whole
    // deployment history of this environment. Archiving preserves it. The name
    // is suffixed so @@unique([projectId, name]) is freed for reuse, and the
    // environment's ServiceEnvironments are archived in the same transaction.
    await this.prisma.$transaction([
      this.prisma.serviceEnvironment.updateMany({
        where: { environmentId: envId, archivedAt: null },
        data: { archivedAt: new Date() },
      }),
      this.prisma.environment.update({
        where: { id: envId },
        data: {
          name: `${env?.name ?? envId}_archived_${Date.now()}`,
          archivedAt: new Date(),
        },
      }),
    ]);
  }

  // NOUVEAU : assigner un serveur à un environnement
  async assignServer(
    projectId: string,
    envId: string,
    serverId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithRelations> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    await this.ensureEnvironmentExists(projectId, envId);

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }

    return await this.prisma.environment.update({
      where: { id: envId },
      data: {
        servers: { connect: { id: serverId } },
      },
      omit: { secretsEnv: true },
      include: environmentsInclude,
    });
  }

  async removeServer(
    projectId: string,
    envId: string,
    serverId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithRelations> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    await this.ensureEnvironmentExists(projectId, envId);

    return await this.prisma.environment.update({
      where: { id: envId },
      data: {
        servers: { disconnect: { id: serverId } },
      },
      omit: { secretsEnv: true },
      include: environmentsInclude,
    });
  }

  // NOUVEAU : lier un service existant à cet environnement
  async linkService(
    projectId: string,
    envId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
  ) {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    await this.ensureEnvironmentExists(projectId, envId);

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, projectId },
    });
    if (!service) {
      throw new NotFoundException('Service non trouvé dans ce projet');
    }

    return await this.prisma.serviceEnvironment.upsert({
      where: {
        serviceId_environmentId: { serviceId, environmentId: envId },
      },
      create: { serviceId, environmentId: envId },
      // Reactivate a previously archived link instead of leaving it invisible
      // (parity with ServiceEnvironmentsService.link).
      update: { archivedAt: null },
      omit: { secretsEnv: true },
      include: {
        service: { select: { id: true, name: true, type: true } },
        environment: { select: { id: true, name: true } },
      },
    });
  }

  private async ensureEnvironmentExists(
    projectId: string,
    envId: string,
  ): Promise<void> {
    const env = await this.prisma.environment.findFirst({
      where: {
        id: envId,
        projectId,
        ...ACTIVE_FILTER,
      },
    });

    if (!env) {
      throw new NotFoundException('Environnement non trouvé');
    }
  }
}

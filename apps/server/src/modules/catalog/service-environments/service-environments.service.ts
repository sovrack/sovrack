import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { activeWhere } from '../../../shared/database/prisma-active.helper';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { ProjectAccessService } from '../authorization/project-access.service';
import { CreateServiceEnvironmentDto } from './dto/create-service-environment.dto';
import { UpdateServiceEnvironmentDto } from './dto/update-service-environment.dto';

const serviceEnvInclude = {
  service: {
    select: {
      id: true,
      name: true,
      type: true,
      port: true,
      branch: true,
      replicas: true,
      env: true,
    },
  },
  environment: {
    select: { id: true, name: true, env: true },
  },
} satisfies Prisma.ServiceEnvironmentInclude;

// secretsEnv is omitted from every read: like Environment/Service, the
// encrypted override secrets are never returned to the client. They are only
// decrypted at deploy time (deployment-env.service → crypto.decryptSafe).
export type ServiceEnvWithRelations = Prisma.ServiceEnvironmentGetPayload<{
  include: typeof serviceEnvInclude;
  omit: { secretsEnv: true };
}>;

@Injectable()
export class ServiceEnvironmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async link(
    projectId: string,
    dto: CreateServiceEnvironmentDto,
    userId: string,
    userRole: Role,
  ): Promise<ServiceEnvWithRelations> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );

    const service = await this.prisma.service.findFirst({
      where: activeWhere({ id: dto.serviceId, projectId }),
    });
    if (!service) {
      throw new NotFoundException('Service non trouvé dans ce projet');
    }

    const env = await this.prisma.environment.findFirst({
      where: { id: dto.environmentId, projectId },
    });
    if (!env) {
      throw new NotFoundException('Environnement non trouvé dans ce projet');
    }

    const existing = await this.prisma.serviceEnvironment.findUnique({
      where: {
        serviceId_environmentId: {
          serviceId: dto.serviceId,
          environmentId: dto.environmentId,
        },
      },
    });
    if (existing && existing.archivedAt === null) {
      throw new ConflictException(
        'Ce service est déjà lié à cet environnement',
      );
    }

    const overrides = {
      serverId: dto.serverId || null,
      branch: dto.branch,
      port: dto.port,
      startCommand: dto.startCommand,
      replicas: dto.replicas,
      healthcheckPath: dto.healthcheckPath,
      buildPack: dto.buildPack,
      env: dto.env,
      // Encrypt secrets at rest; undefined leaves the stored value untouched.
      // '' clears the secret (encryptOptional → null) instead of encrypting
      // an empty string — same semantics as ServicesService.
      secretsEnv:
        dto.secretsEnv !== undefined
          ? this.crypto.encryptOptional(dto.secretsEnv)
          : undefined,
    };

    // Link already exists mais archivé → on RÉACTIVE la même ligne (archivedAt
    // = null) plutôt que d'en créer une nouvelle : préserve son historique et
    // respecte @@unique([serviceId, environmentId]).
    if (existing) {
      return this.prisma.serviceEnvironment.update({
        where: { id: existing.id },
        data: { ...overrides, archivedAt: null },
        omit: { secretsEnv: true },
        include: serviceEnvInclude,
      });
    }

    return this.prisma.serviceEnvironment.create({
      data: {
        serviceId: dto.serviceId,
        environmentId: dto.environmentId,
        ...overrides,
      },
      omit: { secretsEnv: true },
      include: serviceEnvInclude,
    });
  }

  async findByService(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
  ): Promise<ServiceEnvWithRelations[]> {
    await this.projectAccess.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );

    return this.prisma.serviceEnvironment.findMany({
      where: { serviceId, service: { projectId }, archivedAt: null },
      omit: { secretsEnv: true },
      include: serviceEnvInclude,
      orderBy: { environment: { name: 'asc' } },
    });
  }

  async findByEnvironment(
    projectId: string,
    environmentId: string,
    userId: string,
    userRole: Role,
  ): Promise<ServiceEnvWithRelations[]> {
    await this.projectAccess.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );

    return this.prisma.serviceEnvironment.findMany({
      where: { environmentId, environment: { projectId }, archivedAt: null },
      omit: { secretsEnv: true },
      include: serviceEnvInclude,
      orderBy: { service: { name: 'asc' } },
    });
  }

  async findOne(
    projectId: string,
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<ServiceEnvWithRelations> {
    await this.projectAccess.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );

    const link = await this.prisma.serviceEnvironment.findFirst({
      where: { id, service: { projectId } },
      omit: { secretsEnv: true },
      include: serviceEnvInclude,
    });

    if (!link) {
      throw new NotFoundException('Lien service-environnement non trouvé');
    }

    return link;
  }

  async update(
    projectId: string,
    id: string,
    dto: UpdateServiceEnvironmentDto,
    userId: string,
    userRole: Role,
  ): Promise<ServiceEnvWithRelations> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    await this.ensureExists(projectId, id);

    return this.prisma.serviceEnvironment.update({
      where: { id },
      data: {
        ...(dto.serverId !== undefined
          ? { serverId: dto.serverId || null }
          : {}),
        ...(dto.branch !== undefined ? { branch: dto.branch } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
        ...(dto.startCommand !== undefined
          ? { startCommand: dto.startCommand }
          : {}),
        ...(dto.replicas !== undefined ? { replicas: dto.replicas } : {}),
        ...(dto.healthcheckPath !== undefined
          ? { healthcheckPath: dto.healthcheckPath }
          : {}),
        ...(dto.buildPack !== undefined ? { buildPack: dto.buildPack } : {}),
        ...(dto.env !== undefined ? { env: dto.env } : {}),
        ...(dto.autoDeploy !== undefined ? { autoDeploy: dto.autoDeploy } : {}),
        ...(dto.autoBranch !== undefined ? { autoBranch: dto.autoBranch } : {}),
        // Encrypt secrets at rest before persisting. '' clears the secret
        // (encryptOptional → null) instead of encrypting an empty string.
        ...(dto.secretsEnv !== undefined
          ? { secretsEnv: this.crypto.encryptOptional(dto.secretsEnv) }
          : {}),
        // Tout changement d'override = nouvelle génération désirée.
        generation: { increment: 1 },
      },
      omit: { secretsEnv: true },
      include: serviceEnvInclude,
    });
  }

  async unlink(
    projectId: string,
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    await this.ensureExists(projectId, id);

    // Intégrité réseau : ne pas laisser un domaine public router vers un
    // service archivé — exiger le détachement préalable des domaines.
    const activeDomains = await this.prisma.domain.count({
      where: { serviceEnvId: id },
    });
    if (activeDomains > 0) {
      throw new ConflictException(
        `Impossible d'archiver : ${activeDomains} domaine(s) pointent encore vers ce service. Détachez-les d'abord.`,
      );
    }

    // Soft-delete : préserve l'historique Deployment/Build qui référence ce lien.
    await this.prisma.serviceEnvironment.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async linkServiceToAllEnvs(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
    tx?: Prisma.TransactionClient,
  ): Promise<ServiceEnvWithRelations[]> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    const client = tx ?? this.prisma;

    // Active environments only — never link a new service to an archived env.
    const envs = await client.environment.findMany({
      where: { projectId, archivedAt: null },
      select: { id: true },
    });
    if (envs.length === 0) return [];

    // Single read of existing links instead of one findUnique per env (no N+1).
    const existingLinks = await client.serviceEnvironment.findMany({
      where: { serviceId, environmentId: { in: envs.map((e) => e.id) } },
      select: { id: true, environmentId: true, archivedAt: true },
    });
    const linkByEnv = new Map(existingLinks.map((l) => [l.environmentId, l]));

    const ops = envs.map((env) => {
      const existing = linkByEnv.get(env.id);
      if (!existing) {
        return client.serviceEnvironment.create({
          data: { serviceId, environmentId: env.id },
          omit: { secretsEnv: true },
          include: serviceEnvInclude,
        });
      }
      if (existing.archivedAt !== null) {
        // Réactive un lien précédemment archivé au lieu de le laisser de côté.
        return client.serviceEnvironment.update({
          where: { id: existing.id },
          data: { archivedAt: null },
          omit: { secretsEnv: true },
          include: serviceEnvInclude,
        });
      }
      return null;
    });

    const results = await Promise.all(
      ops.filter((op): op is NonNullable<typeof op> => op !== null),
    );
    return results;
  }

  /**
   * Symmetric of linkServiceToAllEnvs: called when a NEW ENVIRONMENT is created
   * to link all existing active services of the project to it.
   * Uses upsert (create-or-reactivate) — safe to call multiple times.
   */
  async linkServiceToAllEnvsForEnvironment(
    environmentId: string,
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );

    const services = await this.prisma.service.findMany({
      where: activeWhere({ projectId }),
      select: { id: true },
    });
    if (services.length === 0) return;

    const existingLinks = await this.prisma.serviceEnvironment.findMany({
      where: {
        environmentId,
        serviceId: { in: services.map((s) => s.id) },
      },
      select: { id: true, serviceId: true, archivedAt: true },
    });
    const linkByService = new Map(existingLinks.map((l) => [l.serviceId, l]));

    const ops = services.map((svc) => {
      const existing = linkByService.get(svc.id);
      if (!existing) {
        return this.prisma.serviceEnvironment.create({
          data: { serviceId: svc.id, environmentId },
        });
      }
      if (existing.archivedAt !== null) {
        return this.prisma.serviceEnvironment.update({
          where: { id: existing.id },
          data: { archivedAt: null },
        });
      }
      return null;
    });
    await Promise.all(
      ops.filter((op): op is NonNullable<typeof op> => op !== null),
    );
  }

  private async ensureExists(projectId: string, id: string): Promise<void> {
    const link = await this.prisma.serviceEnvironment.findFirst({
      where: { id, service: { projectId } },
      select: { id: true },
    });
    if (!link) {
      throw new NotFoundException('Lien service-environnement non trouvé');
    }
  }
}

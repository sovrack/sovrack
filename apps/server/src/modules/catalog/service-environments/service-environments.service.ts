import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { CreateServiceEnvironmentDto } from './dto/create-service-environment.dto';
import { UpdateServiceEnvironmentDto } from './dto/update-service-environment.dto';

const serviceEnvInclude = {
  service: {
    select: { id: true, name: true, type: true, port: true, branch: true, replicas: true, env: true },
  },
  environment: {
    select: { id: true, name: true, env: true },
  },
} satisfies Prisma.ServiceEnvironmentInclude;

export type ServiceEnvWithRelations = Prisma.ServiceEnvironmentGetPayload<{
  include: typeof serviceEnvInclude;
}>;

@Injectable()
export class ServiceEnvironmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async link(
    projectId: string,
    dto: CreateServiceEnvironmentDto,
    userId: string,
    userRole: Role,
  ): Promise<ServiceEnvWithRelations> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, projectId },
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
      throw new ConflictException('Ce service est déjà lié à cet environnement');
    }

    const overrides = {
      branch: dto.branch,
      port: dto.port,
      startCommand: dto.startCommand,
      replicas: dto.replicas,
      healthcheckPath: dto.healthcheckPath,
      buildPack: dto.buildPack,
      env: dto.env,
      // Encrypt secrets at rest; undefined leaves the stored value untouched.
      secretsEnv:
        dto.secretsEnv !== undefined ? this.crypto.encrypt(dto.secretsEnv) : undefined,
    };

    // Link already exists mais archivé → on RÉACTIVE la même ligne (archivedAt
    // = null) plutôt que d'en créer une nouvelle : préserve son historique et
    // respecte @@unique([serviceId, environmentId]).
    if (existing) {
      return this.prisma.serviceEnvironment.update({
        where: { id: existing.id },
        data: { ...overrides, archivedAt: null },
        include: serviceEnvInclude,
      });
    }

    return this.prisma.serviceEnvironment.create({
      data: {
        serviceId: dto.serviceId,
        environmentId: dto.environmentId,
        ...overrides,
      },
      include: serviceEnvInclude,
    });
  }

  async findByService(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
  ): Promise<ServiceEnvWithRelations[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    return this.prisma.serviceEnvironment.findMany({
      where: { serviceId, service: { projectId }, archivedAt: null },
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
    await this.assertCanAccessProject(projectId, userId, userRole);

    return this.prisma.serviceEnvironment.findMany({
      where: { environmentId, environment: { projectId }, archivedAt: null },
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
    await this.assertCanAccessProject(projectId, userId, userRole);

    const link = await this.prisma.serviceEnvironment.findFirst({
      where: { id, service: { projectId } },
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
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureExists(projectId, id);

    return this.prisma.serviceEnvironment.update({
      where: { id },
      data: {
        ...(dto.branch !== undefined ? { branch: dto.branch } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
        ...(dto.startCommand !== undefined ? { startCommand: dto.startCommand } : {}),
        ...(dto.replicas !== undefined ? { replicas: dto.replicas } : {}),
        ...(dto.healthcheckPath !== undefined ? { healthcheckPath: dto.healthcheckPath } : {}),
        ...(dto.buildPack !== undefined ? { buildPack: dto.buildPack } : {}),
        ...(dto.env !== undefined ? { env: dto.env } : {}),
        // Encrypt secrets at rest before persisting.
        ...(dto.secretsEnv !== undefined
          ? { secretsEnv: this.crypto.encrypt(dto.secretsEnv) }
          : {}),
      },
      include: serviceEnvInclude,
    });
  }

  async unlink(
    projectId: string,
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureExists(projectId, id);

    // Intégrité réseau : ne pas laisser un domaine public router vers un
    // service archivé — exiger le détachement préalable des domaines.
    const activeDomains = await this.prisma.domain.count({ where: { serviceEnvId: id } });
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
  ): Promise<ServiceEnvWithRelations[]> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const envs = await this.prisma.environment.findMany({
      where: { projectId },
      select: { id: true },
    });

    const results: ServiceEnvWithRelations[] = [];
    for (const env of envs) {
      const existing = await this.prisma.serviceEnvironment.findUnique({
        where: { serviceId_environmentId: { serviceId, environmentId: env.id } },
      });
      if (!existing) {
        const link = await this.prisma.serviceEnvironment.create({
          data: { serviceId, environmentId: env.id },
          include: serviceEnvInclude,
        });
        results.push(link);
      } else if (existing.archivedAt !== null) {
        // Réactive un lien précédemment archivé au lieu de le laisser de côté.
        const link = await this.prisma.serviceEnvironment.update({
          where: { id: existing.id },
          data: { archivedAt: null },
          include: serviceEnvInclude,
        });
        results.push(link);
      }
    }
    return results;
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

  private async assertCanAccessProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);

    if (userRole === Role.ADMIN) return;

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('Accès non autorisé à ce projet');
    }
  }

  private async assertCanManageProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);

    if (userRole === Role.ADMIN) return;

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });

    if (membership?.role !== ProjectRole.OWNER) {
      throw new ForbiddenException('Action réservée au OWNER du projet ou ADMIN');
    }
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
  }
}

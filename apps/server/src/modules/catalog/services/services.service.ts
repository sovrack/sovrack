import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { ACTIVE_FILTER } from '../../../core/database/prisma-active.helper';
import { ServiceEnvironmentsService } from '../service-environments/service-environments.service';
import { SourceProvidersService } from '../../source-providers/source-providers.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { DiscoverGroupDto } from './dto/discover-group.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

const serviceInclude = {
  envLinks: {
    include: {
      environment: {
        select: { id: true, name: true },
      },
    },
  },
} satisfies Prisma.ServiceInclude;

export type ServiceWithRelations = Prisma.ServiceGetPayload<{
  include: typeof serviceInclude;
  omit: { archivedAt: true };
}>;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceEnvsService: ServiceEnvironmentsService,
    private readonly sourceProviders: SourceProvidersService,
  ) {}

  async findAll(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<ServiceWithRelations[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    return await this.prisma.service.findMany({
      where: { projectId, ...ACTIVE_FILTER },
      orderBy: { createdAt: 'asc' },
      omit: { archivedAt: true },
      include: serviceInclude,
    });
  }

  async findOne(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
  ): Promise<ServiceWithRelations> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, projectId, ...ACTIVE_FILTER },
      omit: { archivedAt: true },
      include: serviceInclude,
    });

    if (!service) {
      throw new NotFoundException('Service non trouvé');
    }

    return service;
  }

  async discoverGroup(
    projectId: string,
    dto: DiscoverGroupDto,
    userId: string,
    userRole: Role,
  ) {
    await this.assertCanAccessProject(projectId, userId, userRole);
    return this.sourceProviders.discoverGroup(
      projectId,
      dto.groupPath,
      dto.provider,
      dto.token,
      dto.providerId,
    );
  }

  async create(
    projectId: string,
    dto: CreateServiceDto,
    userId: string,
    userRole: Role,
  ) {
    await this.assertCanManageProject(projectId, userId, userRole);

    const service = await this.prisma.service.create({
      data: {
        projectId,
        name: dto.name.trim(),
        type: dto.type,
        description: dto.description?.trim(),
        sourceType: dto.sourceType,
        repoPath: dto.repoPath?.trim(),
        branch: dto.branch?.trim() || 'main',
        providerId: dto.providerId?.trim(),
        rootDir: dto.rootDir?.trim() || '/',
        buildPack: dto.buildPack,
        buildType: dto.buildType?.trim(),
        dockerfile: dto.dockerfile,
        port: dto.port ?? 3000,
        startCommand: dto.startCommand?.trim(),
        buildArgs: dto.buildArgs || undefined,
        nixpacksConfig: dto.nixpacksConfig || undefined,
        staticConfig: dto.staticConfig || undefined,
        dockerComposeContent: dto.dockerComposeContent,
        composeServiceName: dto.composeServiceName?.trim(),
        databaseType: dto.databaseType,
        databaseVersion: dto.databaseVersion?.trim() || 'latest',
        databaseCredentials: dto.databaseCredentials || undefined,
        env: dto.env,
        healthcheckPath: dto.healthcheckPath?.trim(),
        replicas: dto.replicas ?? 1,
      },
    });

    // Auto-créer les ServiceEnvironment pour tous les environnements du projet
    await this.serviceEnvsService.linkServiceToAllEnvs(
      projectId,
      service.id,
      userId,
      userRole,
    );

    // Connecter la source si fournie
    if (dto.source) {
      await this.sourceProviders.connectRepo(
        projectId,
        dto.source.repoPath,
        dto.source.provider,
        dto.source.token,
        userId,
        userRole,
        dto.source.branch,
      );
    }

    return this.findOne(projectId, service.id, userId, userRole);
  }

  async update(
    projectId: string,
    serviceId: string,
    dto: UpdateServiceDto,
    userId: string,
    userRole: Role,
  ) {
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureServiceExists(projectId, serviceId);

    return await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() } : {}),
        ...(dto.sourceType !== undefined ? { sourceType: dto.sourceType } : {}),
        ...(dto.repoPath !== undefined ? { repoPath: dto.repoPath?.trim() } : {}),
        ...(dto.branch !== undefined ? { branch: dto.branch?.trim() || 'main' } : {}),
        ...(dto.providerId !== undefined ? { providerId: dto.providerId?.trim() } : {}),
        ...(dto.rootDir !== undefined ? { rootDir: dto.rootDir?.trim() || '/' } : {}),
        ...(dto.buildPack !== undefined ? { buildPack: dto.buildPack } : {}),
        ...(dto.buildType !== undefined ? { buildType: dto.buildType?.trim() } : {}),
        ...(dto.dockerfile !== undefined ? { dockerfile: dto.dockerfile } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
        ...(dto.startCommand !== undefined ? { startCommand: dto.startCommand?.trim() } : {}),
        ...(dto.buildArgs !== undefined ? { buildArgs: dto.buildArgs || null } : {}),
        ...(dto.nixpacksConfig !== undefined ? { nixpacksConfig: dto.nixpacksConfig || null } : {}),
        ...(dto.staticConfig !== undefined ? { staticConfig: dto.staticConfig || null } : {}),
        ...(dto.dockerComposeContent !== undefined ? { dockerComposeContent: dto.dockerComposeContent } : {}),
        ...(dto.composeServiceName !== undefined ? { composeServiceName: dto.composeServiceName?.trim() } : {}),
        ...(dto.databaseType !== undefined ? { databaseType: dto.databaseType } : {}),
        ...(dto.databaseVersion !== undefined ? { databaseVersion: dto.databaseVersion?.trim() || 'latest' } : {}),
        ...(dto.databaseCredentials !== undefined ? { databaseCredentials: dto.databaseCredentials || null } : {}),
        ...(dto.env !== undefined ? { env: dto.env } : {}),
        ...(dto.healthcheckPath !== undefined ? { healthcheckPath: dto.healthcheckPath?.trim() } : {}),
        ...(dto.replicas !== undefined ? { replicas: dto.replicas } : {}),
      },
      include: serviceInclude,
    });
  }

  async remove(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureServiceExists(projectId, serviceId);

    // Soft-delete: archive instead of DELETE so Deployment/Build history that
    // references this service stays intact (SetNull would orphan it). Suffix
    // the name so @@unique([projectId, name]) is freed and the original name
    // can be reused for a new service in the same project.
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { name: true },
    });
    await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        name: `${service?.name ?? serviceId}_archived_${Date.now()}`,
        archivedAt: new Date(),
      },
    });
  }

  private async ensureServiceExists(projectId: string, serviceId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, projectId, ...ACTIVE_FILTER },
      select: { id: true },
    });
    if (!service) {
      throw new NotFoundException('Service non trouvé');
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
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { ServiceEnvironmentsService } from '../service-environments/service-environments.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

const environmentsInclude = {
  serviceLinks: {
    include: {
      service: {
        select: {
          id: true,
          name: true,
          type: true,
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
    },
  },
} satisfies Prisma.EnvironmentInclude;

type EnvironmentWithRelations = Prisma.EnvironmentGetPayload<{
  include: typeof environmentsInclude;
}>;

@Injectable()
export class EnvironmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceEnvsService: ServiceEnvironmentsService,
  ) {}

  async create(
    projectId: string,
    dto: CreateEnvironmentDto,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithRelations> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const env = await this.prisma.environment.create({
      data: {
        name: dto.name,
        projectId,
        env: dto.env,
      },
      include: environmentsInclude,
    });

    // Optionnel : lier tous les services existants à ce nouvel environnement
    // (fait via un endpoint séparé ou un flag dans le DTO)

    return env;
  }

  async findAll(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithRelations[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    return await this.prisma.environment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: environmentsInclude,
    });
  }

  async findOne(
    projectId: string,
    envId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithRelations> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    const env = await this.prisma.environment.findFirst({
      where: { id: envId, projectId },
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
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureEnvironmentExists(projectId, envId);

    return await this.prisma.environment.update({
      where: { id: envId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.env !== undefined ? { env: dto.env } : {}),
      },
      include: environmentsInclude,
    });
  }

  async remove(
    projectId: string,
    envId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureEnvironmentExists(projectId, envId);

    await this.prisma.environment.delete({
      where: { id: envId },
    });
  }

  // NOUVEAU : assigner un serveur à un environnement
  async assignServer(
    projectId: string,
    envId: string,
    serverId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithRelations> {
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureEnvironmentExists(projectId, envId);

    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }

    return await this.prisma.environment.update({
      where: { id: envId },
      data: {
        servers: { connect: { id: serverId } },
      },
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
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureEnvironmentExists(projectId, envId);

    return await this.prisma.environment.update({
      where: { id: envId },
      data: {
        servers: { disconnect: { id: serverId } },
      },
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
    await this.assertCanManageProject(projectId, userId, userRole);
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
      update: {},
      include: {
        service: { select: { id: true, name: true, type: true } },
        environment: { select: { id: true, name: true } },
      },
    });
  }

  private async assertCanAccessProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);

    if (userRole === Role.ADMIN) {
      return;
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
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

    if (userRole === Role.ADMIN) {
      return;
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      select: { role: true },
    });

    if (membership?.role === ProjectRole.OWNER) {
      return;
    }

    throw new ForbiddenException('Action réservée au OWNER du projet ou ADMIN');
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
  }

  private async ensureEnvironmentExists(
    projectId: string,
    envId: string,
  ): Promise<void> {
    const env = await this.prisma.environment.findFirst({
      where: {
        id: envId,
        projectId,
      },
    });

    if (!env) {
      throw new NotFoundException('Environnement non trouvé');
    }
  }
}

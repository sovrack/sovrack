import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Environment, Prisma, ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

const environmentServerInclude = {
  server: {
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      username: true,
      isVerified: true,
      hasDocker: true,
      hasAnsible: true,
      hasRunner: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.EnvironmentInclude;

type EnvironmentWithServer = Prisma.EnvironmentGetPayload<{
  include: typeof environmentServerInclude;
}>;

@Injectable()
export class EnvironmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    projectId: string,
    dto: CreateEnvironmentDto,
    userId: string,
    userRole: Role,
  ): Promise<Environment> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const server = await this.prisma.server.findUnique({
      where: { id: dto.serverId },
    });

    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }

    if (!server.isVerified) {
      throw new BadRequestException(
        'Le serveur cible doit être vérifié avant liaison à un environnement',
      );
    }

    return await this.prisma.environment.create({
      data: {
        name: dto.name,
        domain: dto.domain,
        projectId,
        serverId: dto.serverId,
      },
    });
  }

  async findAll(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithServer[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    return await this.prisma.environment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: environmentServerInclude,
    });
  }

  async findOne(
    projectId: string,
    envId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvironmentWithServer> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    const env = await this.prisma.environment.findFirst({
      where: { id: envId, projectId },
      include: environmentServerInclude,
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
  ): Promise<Environment> {
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureEnvironmentExists(projectId, envId);

    if (dto.serverId) {
      const server = await this.prisma.server.findUnique({
        where: { id: dto.serverId },
      });

      if (!server) {
        throw new NotFoundException('Serveur non trouvé');
      }

      if (!server.isVerified) {
        throw new BadRequestException(
          'Le serveur cible doit être vérifié avant liaison à un environnement',
        );
      }
    }

    return await this.prisma.environment.update({
      where: { id: envId },
      data: dto,
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

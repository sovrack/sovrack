import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateProjectServiceDto } from './dto/create-project-service.dto';
import { UpdateProjectServiceDto } from './dto/update-project-service.dto';

const projectServiceInclude = {
  sourceProvider: {
    select: {
      id: true,
      name: true,
      gitlabUrl: true,
    },
  },
  serviceTargets: {
    include: {
      environment: {
        select: {
          id: true,
          name: true,
          domain: true,
          autoDeploy: true,
          autoDeployBranch: true,
        },
      },
      server: {
        select: {
          id: true,
          name: true,
          host: true,
          port: true,
          username: true,
          isVerified: true,
          hasDocker: true,
          hasRunner: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ProjectServiceInclude;

export type ProjectServiceWithRelations = Prisma.ProjectServiceGetPayload<{
  include: typeof projectServiceInclude;
}>;

@Injectable()
export class ProjectServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<ProjectServiceWithRelations[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    return await this.prisma.projectService.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: projectServiceInclude,
    });
  }

  async create(
    projectId: string,
    dto: CreateProjectServiceDto,
    userId: string,
    userRole: Role,
  ): Promise<ProjectServiceWithRelations> {
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.validateSourceProvider(dto.sourceProviderId);

    try {
      return await this.prisma.projectService.create({
        data: {
          projectId,
          name: this.normalizeServiceName(dto.name),
          type: dto.type,
          sourceProviderId: dto.sourceProviderId?.trim() || undefined,
          externalRepoId: dto.gitlabProjectId,
          repositoryPath: dto.repositoryPath?.trim() || undefined,
          defaultBranch: dto.defaultBranch?.trim() || 'main',
          buildPack: dto.buildPack,
          dockerfilePath: dto.dockerfilePath?.trim() || 'Dockerfile',
          composeServiceName:
            dto.composeServiceName?.trim() ||
            this.normalizeServiceName(dto.name),
          dockerComposeContent: dto.dockerComposeContent,
          nixpacksConfig: dto.nixpacksConfig || undefined,
          staticConfig: dto.staticConfig || undefined,
        },
        include: projectServiceInclude,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException(
          'Un service avec ce nom existe déjà dans ce projet',
        );
      }
      throw error;
    }
  }

  async update(
    projectId: string,
    serviceId: string,
    dto: UpdateProjectServiceDto,
    userId: string,
    userRole: Role,
  ): Promise<ProjectServiceWithRelations> {
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureServiceExists(projectId, serviceId);
    await this.validateSourceProvider(dto.sourceProviderId);

    try {
      return await this.prisma.projectService.update({
        where: { id: serviceId },
        data: {
          ...(dto.name !== undefined
            ? { name: this.normalizeServiceName(dto.name) }
            : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.sourceProviderId !== undefined
            ? { sourceProviderId: dto.sourceProviderId?.trim() || null }
            : {}),
          ...(dto.gitlabProjectId !== undefined
            ? { externalRepoId: dto.gitlabProjectId }
            : {}),
          ...(dto.repositoryPath !== undefined
            ? { repositoryPath: dto.repositoryPath?.trim() || null }
            : {}),
          ...(dto.defaultBranch !== undefined
            ? { defaultBranch: dto.defaultBranch?.trim() || 'main' }
            : {}),
          ...(dto.buildPack !== undefined
            ? { buildPack: dto.buildPack }
            : {}),
          ...(dto.dockerfilePath !== undefined
            ? { dockerfilePath: dto.dockerfilePath?.trim() || 'Dockerfile' }
            : {}),
          ...(dto.composeServiceName !== undefined
            ? { composeServiceName: dto.composeServiceName?.trim() || null }
            : {}),
          ...(dto.dockerComposeContent !== undefined
            ? { dockerComposeContent: dto.dockerComposeContent }
            : {}),
          ...(dto.nixpacksConfig !== undefined
            ? { nixpacksConfig: dto.nixpacksConfig || null }
            : {}),
          ...(dto.staticConfig !== undefined
            ? { staticConfig: dto.staticConfig || null }
            : {}),
        },
        include: projectServiceInclude,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException(
          'Un service avec ce nom existe déjà dans ce projet',
        );
      }
      throw error;
    }
  }

  async remove(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.assertCanManageProject(projectId, userId, userRole);
    await this.ensureServiceExists(projectId, serviceId);

    await this.prisma.projectService.delete({ where: { id: serviceId } });
  }

  private normalizeServiceName(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException('Le nom du service est requis');
    }
    return normalized;
  }

  private async validateSourceProvider(providerId?: string): Promise<void> {
    if (!providerId?.trim()) {
      return;
    }

    const provider = await this.prisma.gitProviderConfig.findUnique({
      where: { id: providerId },
      select: { id: true },
    });

    if (!provider) {
      throw new NotFoundException('Provider GitLab introuvable');
    }
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
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
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
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });

    if (membership?.role !== ProjectRole.OWNER) {
      throw new ForbiddenException(
        'Action réservée au OWNER du projet ou ADMIN',
      );
    }
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
  }

  private async ensureServiceExists(
    projectId: string,
    serviceId: string,
  ): Promise<void> {
    const service = await this.prisma.projectService.findFirst({
      where: { id: serviceId, projectId },
      select: { id: true },
    });
    if (!service) {
      throw new NotFoundException('Service non trouvé');
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

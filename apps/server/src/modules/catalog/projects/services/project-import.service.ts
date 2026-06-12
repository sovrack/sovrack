import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole, Role, SourceType, ServiceType } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { ConnectGitlabDto } from '../../../source-providers/gitlab/dto/connect-gitlab.dto';
import { GitlabCoreService } from '../../../source-providers/gitlab/gitlab-core.service';
import {
  GitlabGroupImportRepositoryDto,
  ImportGitlabGroupDto,
} from '../dto/import-gitlab-group.dto';
import { ProjectsService } from '../projects.service';
import { AuditService } from '../../../audit/audit.service';

const projectWithMembersInclude = {
  members: {
    orderBy: { joinedAt: 'asc' as const },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.ProjectInclude;

type ProjectWithMembers = Prisma.ProjectGetPayload<{
  include: typeof projectWithMembersInclude;
}>;

@Injectable()
export class ProjectImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitlabCore: GitlabCoreService,
    private readonly projectsService: ProjectsService,
    private readonly auditService: AuditService,
  ) {}

  async importGitlabGroup(
    userId: string,
    userRole: Role,
    dto: ImportGitlabGroupDto,
  ): Promise<{ mode: string; projects: ProjectWithMembers[] }> {
    const ownerId = await this.resolveOwnerId(userId, userRole, dto.ownerId);
    this.assertUniqueRepositorySelection(dto.repositories);

    await this.verifyGitlabGroupImport(dto);

    const createdProjectIds: string[] = [];
    try {
      if (dto.importMode === 'ONE_APPLICATION') {
        const project = await this.prisma.project.create({
          data: {
            name: dto.name.trim(),
            description: dto.description?.trim() || undefined,
            members: {
              create: {
                userId: ownerId,
                role: ProjectRole.OWNER,
              },
            },
          },
          include: projectWithMembersInclude,
        });
        createdProjectIds.push(project.id);

        // Create a default environment
        const env = await this.prisma.environment.create({
          data: {
            name: 'default',
            projectId: project.id,
          },
        });

        // Create services at project level and link to environment
        for (const repository of dto.repositories) {
          const svc = await this.prisma.service.create({
            data: {
              ...this.toServiceCreateData(repository, dto.providerId),
              projectId: project.id,
            } as Prisma.ServiceUncheckedCreateInput,
          });
          await this.prisma.serviceEnvironment.create({
            data: { serviceId: svc.id, environmentId: env.id },
          });
        }

        await this.gitlabCore.connectProject(
          project.id,
          {
            providerId: dto.providerId?.trim() || undefined,
            gitlabUrl: dto.gitlabUrl?.trim() || undefined,
            gitlabToken: dto.gitlabToken?.trim() || undefined,
            groupPath: dto.groupId.trim(),
            defaultBranch: this.resolvePrimaryBranch(dto.repositories),
          },
          userId,
          userRole,
        );

        await this.auditService.record(
          userId,
          'PROJECT_IMPORT_GITLAB_GROUP',
          'Project',
          project.id,
          {
            importMode: dto.importMode,
            groupId: dto.groupId,
            repositories: dto.repositories.map((repository) => repository.id),
          },
        );

        return {
          mode: dto.importMode,
          projects: [
            await this.prisma.project.findUniqueOrThrow({
              where: { id: project.id },
              include: projectWithMembersInclude,
            }),
          ],
        };
      }

      const importedProjects: ProjectWithMembers[] = [];
      for (const repository of dto.repositories) {
        const project = await this.prisma.project.create({
          data: {
            name: repository.serviceName?.trim() || repository.name.trim(),
            description: dto.description?.trim() || undefined,
            members: {
              create: {
                userId: ownerId,
                role: ProjectRole.OWNER,
              },
            },
          },
          include: projectWithMembersInclude,
        });
        createdProjectIds.push(project.id);

        // Create a default environment with service
        const env = await this.prisma.environment.create({
          data: {
            name: 'default',
            projectId: project.id,
          },
        });

        const svc = await this.prisma.service.create({
          data: {
            ...this.toServiceCreateData(repository, dto.providerId),
            projectId: project.id,
          } as Prisma.ServiceUncheckedCreateInput,
        });
        await this.prisma.serviceEnvironment.create({
          data: { serviceId: svc.id, environmentId: env.id },
        });

        await this.gitlabCore.connectProject(
          project.id,
          {
            providerId: dto.providerId?.trim() || undefined,
            gitlabUrl: dto.gitlabUrl?.trim() || undefined,
            gitlabToken: dto.gitlabToken?.trim() || undefined,
            repoPath: repository.pathWithNamespace.trim(),
            defaultBranch: repository.defaultBranch.trim() || 'main',
          },
          userId,
          userRole,
        );

        importedProjects.push(
          await this.prisma.project.findUniqueOrThrow({
            where: { id: project.id },
            include: projectWithMembersInclude,
          }),
        );
      }

      await this.auditService.record(
        userId,
        'PROJECT_IMPORT_GITLAB_GROUP',
        'Project',
        importedProjects[0]?.id ?? 'multiple',
        {
          importMode: dto.importMode,
          groupId: dto.groupId,
          projectIds: importedProjects.map((project) => project.id),
          repositories: dto.repositories.map((repository) => repository.id),
        },
      );

      return { mode: dto.importMode, projects: importedProjects };
    } catch (error) {
      await this.cleanupCreatedProjects(createdProjectIds);
      throw error;
    }
  }

  private async resolveOwnerId(
    userId: string,
    userRole: Role,
    ownerId?: string,
  ): Promise<string> {
    const resolvedOwnerId = ownerId ?? userId;

    if (!ownerId) {
      return resolvedOwnerId;
    }

    if (userRole !== Role.ADMIN && ownerId !== userId) {
      throw new ForbiddenException(
        'Seul un administrateur peut assigner un owner différent',
      );
    }

    const ownerUser = await this.prisma.user.findUnique({
      where: { id: ownerId },
    });

    if (!ownerUser) {
      throw new NotFoundException('Utilisateur owner introuvable');
    }

    if (ownerUser.role !== Role.DEVELOPER) {
      throw new ConflictException(
        'Le owner assigné doit avoir le rôle DEVELOPER',
      );
    }

    return resolvedOwnerId;
  }

  private async verifyGitlabGroupImport(
    dto: ImportGitlabGroupDto,
  ): Promise<void> {
    await this.gitlabCore.listGroupRepositoriesByProvider({
      providerId: dto.providerId?.trim() || undefined,
      gitlabUrl: dto.gitlabUrl?.trim() || undefined,
      gitlabToken: dto.gitlabToken?.trim() || undefined,
      groupId: dto.groupId.trim(),
      query: { page: 1, perPage: 1 },
    });

    for (const repository of dto.repositories) {
      const branchName = repository.defaultBranch.trim() || 'main';
      const branches = await this.gitlabCore.listProjectBranchesByProvider({
        providerId: dto.providerId?.trim() || undefined,
        gitlabUrl: dto.gitlabUrl?.trim() || undefined,
        gitlabToken: dto.gitlabToken?.trim() || undefined,
        projectId: String(repository.id),
      });

      const branchExists = branches.some((branch) => {
        const name = branch.name;
        return typeof name === 'string' && name === branchName;
      });

      if (!branchExists) {
        throw new ConflictException(
          `Branche "${branchName}" introuvable pour ${repository.pathWithNamespace}`,
        );
      }
    }
  }

  private assertUniqueRepositorySelection(
    repositories: GitlabGroupImportRepositoryDto[],
  ): void {
    const ids = new Set<number>();
    for (const repository of repositories) {
      if (ids.has(repository.id)) {
        throw new ConflictException(
          `Repository GitLab dupliqué: ${String(repository.id)}`,
        );
      }
      ids.add(repository.id);
    }
  }

  private resolvePrimaryBranch(
    repositories: GitlabGroupImportRepositoryDto[],
  ): string {
    return repositories[0]?.defaultBranch?.trim() || 'main';
  }

  private toServiceCreateData(
    repository: GitlabGroupImportRepositoryDto,
    providerId?: string,
  ) {
    const serviceName =
      repository.serviceName?.trim() || repository.name.trim();
    return {
      name: serviceName,
      type: ServiceType.APPLICATION,
      repoPath: repository.pathWithNamespace.trim() || undefined,
      branch: repository.defaultBranch.trim() || 'main',
      sourceType: SourceType.GIT,
      providerId: providerId?.trim() || undefined,
      composeServiceName: this.slugifyServiceName(serviceName),
    };
  }

  private slugifyServiceName(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'service';
  }

  private async cleanupCreatedProjects(projectIds: string[]): Promise<void> {
    await Promise.all(
      projectIds.map(async (projectId) => {
        try {
          await this.prisma.project.delete({ where: { id: projectId } });
        } catch {
          // Best-effort rollback
        }
      }),
    );
  }
}

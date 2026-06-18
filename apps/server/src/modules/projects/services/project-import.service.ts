import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppSourceType, Prisma, ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { ConnectGitlabDto } from '../../git-providers/gitlab/dto/connect-gitlab.dto';
import { GitlabService } from '../../git-providers/gitlab/gitlab.service';
import {
  GitlabGroupImportRepositoryDto,
  ImportGitlabGroupDto,
} from '../dto/import-gitlab-group.dto';
import { ProjectsService } from '../projects.service';
import { AuditService } from '../../audit/audit.service';

const projectWithMembersInclude = {
  services: {
    orderBy: { createdAt: 'asc' as const },
  },
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
    private readonly gitlabService: GitlabService,
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
            repoUrl: dto.gitlabUrl?.trim() || '',
            branch: this.resolvePrimaryBranch(dto.repositories),
            members: {
              create: {
                userId: ownerId,
                role: ProjectRole.OWNER,
              },
            },
            services: {
              create: dto.repositories.map((repository) =>
                this.toProjectServiceCreateData(repository, dto.providerId),
              ),
            },
          },
          include: projectWithMembersInclude,
        });
        createdProjectIds.push(project.id);

        await this.gitlabService.connectProject(
          project.id,
          {
            providerId: dto.providerId?.trim() || undefined,
            gitlabUrl: dto.gitlabUrl?.trim() || undefined,
            gitlabToken: dto.gitlabToken?.trim() || undefined,
            sourceType: AppSourceType.GROUP,
            gitlabGroupId: dto.groupId.trim(),
            defaultBranch: this.resolvePrimaryBranch(dto.repositories),
          } as ConnectGitlabDto,
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
            repoUrl: dto.gitlabUrl?.trim() || '',
            branch: repository.defaultBranch.trim() || 'main',
            externalRepoId: repository.id,
            members: {
              create: {
                userId: ownerId,
                role: ProjectRole.OWNER,
              },
            },
            services: {
              create: this.toProjectServiceCreateData(
                repository,
                dto.providerId,
              ),
            },
          },
          include: projectWithMembersInclude,
        });
        createdProjectIds.push(project.id);

        await this.gitlabService.connectProject(
          project.id,
          {
            providerId: dto.providerId?.trim() || undefined,
            gitlabUrl: dto.gitlabUrl?.trim() || undefined,
            gitlabToken: dto.gitlabToken?.trim() || undefined,
            sourceType: AppSourceType.REPO,
            gitlabId: repository.id,
            defaultBranch: repository.defaultBranch.trim() || 'main',
          } as ConnectGitlabDto,
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
    await this.gitlabService.listGroupRepositoriesByProvider({
      providerId: dto.providerId?.trim() || undefined,
      gitlabUrl: dto.gitlabUrl?.trim() || undefined,
      gitlabToken: dto.gitlabToken?.trim() || undefined,
      groupId: dto.groupId.trim(),
      query: { page: 1, perPage: 1 },
    });

    for (const repository of dto.repositories) {
      const branchName = repository.defaultBranch.trim() || 'main';
      const branches = await this.gitlabService.listProjectBranchesByProvider({
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

  private toProjectServiceCreateData(
    repository: GitlabGroupImportRepositoryDto,
    providerId?: string,
  ): Prisma.ProjectServiceCreateWithoutProjectInput {
    const serviceName =
      repository.serviceName?.trim() || repository.name.trim();
    return {
      name: serviceName,
      type: repository.serviceType,
      sourceProvider: providerId?.trim()
        ? { connect: { id: providerId.trim() } }
        : undefined,
      externalRepoId: repository.id,
      repositoryPath: repository.pathWithNamespace.trim(),
      defaultBranch: repository.defaultBranch.trim() || 'main',
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

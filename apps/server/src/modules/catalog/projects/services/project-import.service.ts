import { ConflictException, Injectable } from '@nestjs/common';
import {
  Prisma,
  ProjectRole,
  Role,
  SourceType,
  ServiceType,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { GitlabAdapter } from '../../../source-providers/adapters/gitlab/gitlab.adapter';
import {
  GitlabGroupImportRepositoryDto,
  ImportGitlabGroupDto,
} from '../dto/import-gitlab-group.dto';
import { ProjectsService } from '../projects.service';
import { AuditService } from '../../../audit/audit.service';
import { WorkspaceAccessService } from '../../../iam/authorization/workspace-access.service';
import { WorkspaceActions } from '../../../iam/authorization/workspace-policy.types';
import { UsageGuardService } from '../../../billing/usage-guard.service';

const projectWithMembersInclude = {
  members: {
    orderBy: { joinedAt: 'asc' as const },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
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
    private readonly gitlabCore: GitlabAdapter,
    private readonly projectsService: ProjectsService,
    private readonly auditService: AuditService,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly usageGuard: UsageGuardService,
  ) {}

  async importGitlabGroup(
    userId: string,
    userRole: Role,
    dto: ImportGitlabGroupDto,
    requestedWorkspaceId?: string,
  ): Promise<{ mode: string; projects: ProjectWithMembers[] }> {
    const teamId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      teamId,
      userId,
      WorkspaceActions.CREATE_PROJECT,
    );
    const ownerId = dto.ownerId ?? userId;
    await this.workspaceAccess.assertUserIsActiveMember(teamId, ownerId);
    this.assertUniqueRepositorySelection(dto.repositories);

    await this.verifyGitlabGroupImport(dto, teamId);

    const createdProjectIds: string[] = [];
    try {
      if (dto.importMode === 'ONE_APPLICATION') {
        await this.usageGuard.guardForTeam(teamId, 'CREATE_PROJECT');
        const project = await this.createProjectWithMaintainer(
          teamId,
          ownerId,
          dto.name.trim(),
          dto.description?.trim(),
        );
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
            },
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
        await this.usageGuard.guardForTeam(teamId, 'CREATE_PROJECT');
        const project = await this.createProjectWithMaintainer(
          teamId,
          ownerId,
          repository.serviceName?.trim() || repository.name.trim(),
          dto.description?.trim(),
        );
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
          },
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

  private async verifyGitlabGroupImport(
    dto: ImportGitlabGroupDto,
    teamId: string,
  ): Promise<void> {
    await this.gitlabCore.listGroupRepositoriesByProvider({
      teamId,
      providerId: dto.providerId?.trim() || undefined,
      gitlabUrl: dto.gitlabUrl?.trim() || undefined,
      gitlabToken: dto.gitlabToken?.trim() || undefined,
      groupId: dto.groupId.trim(),
      query: { page: 1, perPage: 1 },
    });

    for (const repository of dto.repositories) {
      const branchName = repository.defaultBranch.trim() || 'main';
      const branches = await this.gitlabCore.listProjectBranchesByProvider({
        teamId,
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

  private async createProjectWithMaintainer(
    teamId: string,
    userId: string,
    name: string,
    description?: string,
  ): Promise<ProjectWithMembers> {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { teamId, name, description: description || null },
      });
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          teamId,
          userId,
          role: ProjectRole.MAINTAINER,
        },
      });
      return tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: projectWithMembersInclude,
      });
    });
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

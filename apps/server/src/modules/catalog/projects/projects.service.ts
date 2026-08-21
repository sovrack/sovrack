import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Project,
  ProjectRole,
  Prisma,
  Role,
  WorkspaceRole,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  PaginationDto,
  PaginatedResult,
  paginate,
} from '../../../shared/http/pagination.dto';
import { ProjectAccessService } from '../authorization/project-access.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UsageGuardService } from '../../billing/usage-guard.service';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';
import {
  ProjectActions,
  WorkspaceActions,
} from '../../iam/authorization/workspace-policy.types';

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

type ProjectListItem = Project & {
  memberCount: number;
  environmentCount: number;
  serviceCount: number;
  hasGitlabConfig: boolean;
  currentUserProjectRole: ProjectRole | null;
};

/**
 * Service métier des projets.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly projectAccess: ProjectAccessService,
    private readonly usageGuard: UsageGuardService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  /**
   * Crée un projet et ajoute automatiquement son créateur en OWNER.
   */
  async create(
    userId: string,
    _userRole: Role,
    dto: CreateProjectDto,
    requestedWorkspaceId?: string,
  ): Promise<ProjectWithMembers> {
    const ownerId = dto.ownerId ?? userId;
    const teamId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      teamId,
      userId,
      WorkspaceActions.CREATE_PROJECT,
    );
    await this.usageGuard.guardForTeam(teamId, 'CREATE_PROJECT');
    await this.workspaceAccess.assertUserIsActiveMember(teamId, ownerId);

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: dto.name,
          description: dto.description,
          teamId,
        },
      });
      await tx.projectMember.create({
        data: {
          projectId: created.id,
          teamId,
          userId: ownerId,
          role: ProjectRole.MAINTAINER,
        },
      });
      return tx.project.findUniqueOrThrow({
        where: { id: created.id },
        include: projectWithMembersInclude,
      });
    });

    await this.auditService.record(
      userId,
      'PROJECT_CREATE',
      'Project',
      project.id,
      {
        name: project.name,
        ownerId,
        teamId,
      },
    );

    return project;
  }

  /**
   * Liste les projets selon le rôle utilisateur.
   */
  async findAll(
    userId: string,
    _userRole: Role,
    pagination?: PaginationDto,
    requestedWorkspaceId?: string,
  ): Promise<ProjectListItem[] | PaginatedResult<ProjectListItem>> {
    const teamId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    const workspace = await this.workspaceAccess.assertWorkspaceAction(
      teamId,
      userId,
      WorkspaceActions.READ,
    );
    const hasWorkspaceWideAccess =
      workspace.workspaceRole === WorkspaceRole.OWNER ||
      workspace.workspaceRole === WorkspaceRole.ADMIN;
    const where: Prisma.ProjectWhereInput = {
      teamId,
      ...(hasWorkspaceWideAccess ? {} : { members: { some: { userId } } }),
    };

    const queryInclude = {
      members: { where: { userId }, select: { role: true }, take: 1 },
      _count: { select: { members: true, environments: true, services: true } },
      services: {
        where: { archivedAt: null, providerId: { not: null } },
        select: { id: true },
        take: 1,
      },
    };

    const page = pagination?.page;
    const limit = pagination?.limit;

    const rawProjects =
      page && limit
        ? await this.prisma.project.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: queryInclude,
            skip: (page - 1) * limit,
            take: limit,
          })
        : await this.prisma.project.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: queryInclude,
          });

    const projects = rawProjects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      teamId: project.teamId,
      maxConcurrentDeploys: project.maxConcurrentDeploys,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      memberCount: project._count.members,
      environmentCount: project._count.environments,
      serviceCount: project._count.services,
      hasGitlabConfig: project.services.length > 0,
      currentUserProjectRole: hasWorkspaceWideAccess
        ? ProjectRole.MAINTAINER
        : (project.members[0]?.role ?? null),
    }));

    if (page && limit) {
      const total = await this.prisma.project.count({ where });
      return paginate(projects, total, page, limit);
    }

    return projects;
  }

  /**
   * Retourne un projet si l'utilisateur y a accès.
   */
  async findOne(
    projectId: string,
    userId: string,
    _userRole: Role,
    requestedWorkspaceId?: string,
  ): Promise<ProjectWithMembers> {
    const teamId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.READ,
      teamId,
    );

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: projectWithMembersInclude,
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    return project;
  }

  /**
   * Met à jour un projet si utilisateur OWNER ou ADMIN.
   */
  async update(
    projectId: string,
    userId: string,
    userRole: Role,
    dto: UpdateProjectDto,
    requestedWorkspaceId?: string,
  ): Promise<ProjectWithMembers> {
    const teamId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.UPDATE,
      teamId,
    );

    const rest = dto;
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: rest,
      include: projectWithMembersInclude,
    });

    return project;
  }

  /**
   * Supprime un projet si utilisateur ADMIN.
   */
  async remove(
    projectId: string,
    userId: string,
    _userRole: Role,
    requestedWorkspaceId?: string,
  ): Promise<void> {
    const teamId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    await this.workspaceAccess.assertWorkspaceAction(
      teamId,
      userId,
      WorkspaceActions.DELETE_PROJECT,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.deployment.deleteMany({ where: { projectId } });
      await tx.pipelineRun.deleteMany({ where: { projectId } });
      await tx.build.deleteMany({ where: { projectId } });
      await tx.dnsRecord.deleteMany({
        where: {
          OR: [{ domain: { projectId } }],
        },
      });
      await tx.domain.deleteMany({ where: { projectId } });
      await tx.environment.deleteMany({ where: { projectId } });
      await tx.projectMember.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await this.auditService.record(
      userId,
      'PROJECT_DELETE',
      'Project',
      projectId,
    );
  }

  /**
   * Vérifie si l'utilisateur peut voir le projet.
   */
  async assertCanAccessProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    // Delegates to the single shared implementation (ProjectAccessService).
    // Kept as a public method because ProjectMembersService relies on it.
    return this.projectAccess.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );
  }

  /**
   * Vérifie si l'utilisateur peut gérer le projet (OWNER ou ADMIN).
   */
  async assertCanManageProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    return this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
  }

  /**
   * Vérifie l'existence du projet.
   */
  async ensureProjectExists(projectId: string): Promise<void> {
    return this.projectAccess.ensureProjectExists(projectId);
  }
}

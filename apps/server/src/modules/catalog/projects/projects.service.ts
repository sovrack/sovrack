import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Project, ProjectRole, Prisma, Role } from '@prisma/client';
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
import { BillingService } from '../../billing/billing.service';

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
    private readonly billing: BillingService,
  ) {}

  /**
   * Crée un projet et ajoute automatiquement son créateur en OWNER.
   */
  async create(
    userId: string,
    userRole: Role,
    dto: CreateProjectDto,
  ): Promise<ProjectWithMembers> {
    const ownerId = dto.ownerId ?? userId;

    // Limite de plan : la team du créateur doit avoir de la place.
    await this.usageGuard.guard(userId, 'CREATE_PROJECT');

    // Rattache le projet à la team de son créateur (tenant billing v2).
    const teamId = await this.billing.resolveTeamId(userId);

    if (dto.ownerId) {
      if (userRole !== Role.OWNER && dto.ownerId !== userId) {
        throw new ForbiddenException(
          'Seul un administrateur peut assigner un owner différent',
        );
      }

      const ownerUser = await this.prisma.user.findUnique({
        where: { id: dto.ownerId },
      });

      if (!ownerUser) {
        throw new NotFoundException('Utilisateur owner introuvable');
      }

      if (ownerUser.role !== Role.MEMBER) {
        throw new ConflictException(
          'Le owner assigné doit avoir le rôle DEVELOPER',
        );
      }
    }

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        teamId,
        members: {
          create: {
            userId: ownerId,
            role: ProjectRole.OWNER,
          },
        },
      },
      include: projectWithMembersInclude,
    });

    await this.auditService.record(
      userId,
      'PROJECT_CREATE',
      'Project',
      project.id,
      {
        name: project.name,
        ownerId,
      },
    );

    return project;
  }

  /**
   * Liste les projets selon le rôle utilisateur.
   */
  async findAll(
    userId: string,
    userRole: Role,
    pagination?: PaginationDto,
  ): Promise<ProjectListItem[] | PaginatedResult<ProjectListItem>> {
    // Multi-tenant : un utilisateur ne voit que les projets dont il est membre
    // (son organisation).
    const where: Prisma.ProjectWhereInput | undefined = {
      members: { some: { userId } },
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
      currentUserProjectRole: project.members[0]?.role ?? null,
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
    userRole: Role,
  ): Promise<ProjectWithMembers> {
    await this.assertCanAccessProject(projectId, userId, userRole);

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
  ): Promise<ProjectWithMembers> {
    await this.assertCanManageProject(projectId, userId, userRole);

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
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);
    this.assertAdminRole(userRole);

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

  private assertAdminRole(userRole: Role): void {
    if (userRole !== Role.OWNER) {
      throw new ForbiddenException('Action réservée aux administrateurs');
    }
  }

  /**
   * Vérifie l'existence du projet.
   */
  async ensureProjectExists(projectId: string): Promise<void> {
    return this.projectAccess.ensureProjectExists(projectId);
  }
}

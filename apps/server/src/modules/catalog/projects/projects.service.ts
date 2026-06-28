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
import { ProjectAccessService } from '../access/project-access.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

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

    if (dto.ownerId) {
      if (userRole !== Role.ADMIN && dto.ownerId !== userId) {
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

      if (ownerUser.role !== Role.DEVELOPER) {
        throw new ConflictException(
          'Le owner assigné doit avoir le rôle DEVELOPER',
        );
      }
    }

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
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
    const where: Prisma.ProjectWhereInput | undefined =
      userRole === Role.ADMIN ? undefined : { members: { some: { userId } } };

    const queryInclude = {
      members: { where: { userId }, select: { role: true }, take: 1 },
      _count: { select: { members: true, environments: true, services: true } },
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
      maxConcurrentDeploys: project.maxConcurrentDeploys,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      memberCount: project._count.members,
      environmentCount: project._count.environments,
      serviceCount: project._count.services,
      hasGitlabConfig: false, // removed — git provider info on Service
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
   * Matrice de déploiement du projet : services (lignes) × environnements
   * (colonnes), chaque cellule = un ServiceEnvironment avec l'état de sa release
   * COURANTE (currentDeployment, pointeur L3) et un drapeau OutOfSync
   * (génération désirée > génération déployée, L1). Vue qui reflète 1:1 le modèle
   * M:N — l'unité visible est la CELLULE, pas le service. Une cellule absente du
   * tableau = service non lié à cet environnement.
   */
  async getMatrix(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<{
    services: { id: string; name: string; type: string }[];
    environments: { id: string; name: string; isProtected: boolean }[];
    cells: {
      serviceId: string;
      environmentId: string;
      serviceEnvId: string;
      currentDeploymentId: string | null;
      status: string | null;
      outOfSync: boolean;
      lastDeployedAt: Date | null;
    }[];
  }> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    const [services, environments, links] = await Promise.all([
      this.prisma.service.findMany({
        where: { projectId, archivedAt: null },
        select: { id: true, name: true, type: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.environment.findMany({
        where: { projectId, archivedAt: null },
        select: { id: true, name: true, isProtected: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.serviceEnvironment.findMany({
        where: { archivedAt: null, environment: { projectId } },
        select: {
          id: true,
          serviceId: true,
          environmentId: true,
          generation: true,
          currentDeploymentId: true,
          currentDeployment: {
            select: {
              id: true,
              status: true,
              observedGeneration: true,
              finishedAt: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const cells = links.map((link) => {
      const current = link.currentDeployment;
      // OutOfSync (L1) : la config désirée (generation de la cellule) dépasse
      // celle réellement déployée (observedGeneration de la release courante).
      const outOfSync = current
        ? link.generation > (current.observedGeneration ?? 0)
        : false;
      return {
        serviceId: link.serviceId,
        environmentId: link.environmentId,
        serviceEnvId: link.id,
        currentDeploymentId: link.currentDeploymentId ?? null,
        status: current?.status ?? null,
        outOfSync,
        lastDeployedAt: current?.finishedAt ?? current?.createdAt ?? null,
      };
    });

    return { services, environments, cells };
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
    if (userRole !== Role.ADMIN) {
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

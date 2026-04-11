import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Project, ProjectMemberRole, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddMemberDto } from './dto/add-member.dto';
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
};

/**
 * Service métier des projets.
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crée un projet et ajoute automatiquement son créateur en OWNER.
   */
  async create(
    userId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectWithMembers> {
    const ownerId = dto.ownerId ?? userId;

    if (dto.ownerId) {
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
        gitlabUrl: dto.gitlabUrl,
        branch: dto.branch ?? 'main',
        members: {
          create: {
            userId: ownerId,
            role: ProjectMemberRole.OWNER,
          },
        },
      },
      include: projectWithMembersInclude,
    });

    return project;
  }

  /**
   * Liste les projets selon le rôle utilisateur.
   */
  async findAll(userId: string, userRole: Role): Promise<ProjectListItem[]> {
    const where: Prisma.ProjectWhereInput | undefined =
      userRole === Role.ADMIN
        ? undefined
        : {
            members: {
              some: {
                userId,
              },
            },
          };

    const projects = await this.prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      gitlabUrl: project.gitlabUrl,
      gitlabId: project.gitlabId,
      branch: project.branch,
      dockerfile: project.dockerfile,
      port: project.port,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      memberCount: project._count.members,
    }));
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

    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: dto,
      include: projectWithMembersInclude,
    });

    return project;
  }

  /**
   * Supprime un projet si utilisateur OWNER ou ADMIN.
   */
  async remove(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.assertCanManageProject(projectId, userId, userRole);

    await this.prisma.project.delete({ where: { id: projectId } });
  }

  /**
   * Ajoute un membre à un projet.
   */
  async addMember(
    projectId: string,
    userId: string,
    userRole: Role,
    dto: AddMemberDto,
  ): Promise<ProjectWithMembers> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const lookup = dto.userId
      ? { id: dto.userId }
      : dto.email
        ? { email: dto.email.toLowerCase() }
        : null;

    if (!lookup) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: lookup,
    });
    if (!targetUser) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const existingMembership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: targetUser.id,
        },
      },
    });

    if (existingMembership) {
      throw new ConflictException('Utilisateur déjà membre de ce projet');
    }

    await this.prisma.projectMember.create({
      data: {
        projectId,
        userId: targetUser.id,
        role: dto.role ?? ProjectMemberRole.MEMBER,
      },
    });

    return await this.findOne(projectId, userId, userRole);
  }

  /**
   * Retire un membre du projet (sauf OWNER).
   */
  async removeMember(
    projectId: string,
    userId: string,
    userRole: Role,
    targetUserId: string,
  ): Promise<ProjectWithMembers> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: targetUserId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Membre non trouvé dans ce projet');
    }

    if (membership.role === ProjectMemberRole.OWNER) {
      throw new ForbiddenException('Impossible de retirer le OWNER du projet');
    }

    await this.prisma.projectMember.delete({
      where: {
        projectId_userId: {
          projectId,
          userId: targetUserId,
        },
      },
    });

    return await this.findOne(projectId, userId, userRole);
  }

  /**
   * Retourne les membres d'un projet si l'utilisateur y a accès.
   */
  async getMembers(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<ProjectWithMembers['members']> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { joinedAt: 'asc' },
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
    });

    return members;
  }

  /**
   * Vérifie si l'utilisateur peut voir le projet.
   */
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

  /**
   * Vérifie si l'utilisateur peut gérer le projet (OWNER ou ADMIN).
   */
  private async assertCanManageProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);

    if (userRole === Role.ADMIN) {
      return;
    }

    const ownerMembership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!ownerMembership || ownerMembership.role !== ProjectMemberRole.OWNER) {
      throw new ForbiddenException(
        'Action réservée au OWNER du projet ou ADMIN',
      );
    }
  }

  /**
   * Vérifie l'existence du projet.
   */
  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
  }
}

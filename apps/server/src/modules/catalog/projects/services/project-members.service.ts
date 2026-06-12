import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { AddMemberDto } from '../dto/add-member.dto';
import { ProjectsService } from '../projects.service';

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
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * Ajoute un membre au projet.
   */
  async addMember(
    projectId: string,
    userId: string,
    userRole: Role,
    dto: AddMemberDto,
  ): Promise<ProjectWithMembers> {
    await this.projectsService.assertCanManageProject(projectId, userId, userRole);

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
        role: dto.role ?? ProjectRole.DEVELOPER,
      },
    });

    return await this.projectsService.findOne(projectId, userId, userRole);
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
    await this.projectsService.assertCanManageProject(projectId, userId, userRole);

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

    if (membership.role === ProjectRole.OWNER) {
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

    return await this.projectsService.findOne(projectId, userId, userRole);
  }

  /**
   * Retourne les membres d'un projet si l'utilisateur y a accès.
   */
  async getMembers(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<ProjectWithMembers['members']> {
    await this.projectsService.assertCanAccessProject(projectId, userId, userRole);

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
}

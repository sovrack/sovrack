import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { AddMemberDto } from '../dto/add-member.dto';
import { ProjectsService } from '../projects.service';
import { WorkspaceAccessService } from '../../../iam/authorization/workspace-access.service';
import { ProjectActions } from '../../../iam/authorization/workspace-policy.types';

// Shape used only to derive the ProjectWithMembers type (via typeof); the
// runtime value itself isn't passed to a query, hence the `_` prefix.
const _projectWithMembersInclude = {
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
  include: typeof _projectWithMembersInclude;
}>;

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  /**
   * Ajoute un membre au projet.
   */
  async addMember(
    projectId: string,
    userId: string,
    userRole: Role,
    dto: AddMemberDto,
    expectedWorkspaceId?: string,
  ): Promise<ProjectWithMembers> {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.MANAGE_MEMBERS,
      expectedWorkspaceId,
    );

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
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    await this.workspaceAccess.assertUserIsActiveMember(
      project.teamId,
      targetUser.id,
    );

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
        teamId: project.teamId,
        userId: targetUser.id,
        role: dto.role ?? ProjectRole.DEVELOPER,
      },
    });

    return await this.projectsService.findOne(
      projectId,
      userId,
      userRole,
      expectedWorkspaceId,
    );
  }

  /**
   * Retire un membre du projet (sauf OWNER).
   */
  async removeMember(
    projectId: string,
    userId: string,
    userRole: Role,
    targetUserId: string,
    expectedWorkspaceId?: string,
  ): Promise<ProjectWithMembers> {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.MANAGE_MEMBERS,
      expectedWorkspaceId,
    );

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

    await this.prisma.projectMember.delete({
      where: {
        projectId_userId: {
          projectId,
          userId: targetUserId,
        },
      },
    });

    return await this.projectsService.findOne(
      projectId,
      userId,
      userRole,
      expectedWorkspaceId,
    );
  }

  async updateMemberRole(
    projectId: string,
    userId: string,
    userRole: Role,
    targetUserId: string,
    role: ProjectRole,
    expectedWorkspaceId?: string,
  ): Promise<ProjectWithMembers> {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.MANAGE_MEMBERS,
      expectedWorkspaceId,
    );
    const updated = await this.prisma.projectMember.updateMany({
      where: { projectId, userId: targetUserId },
      data: { role },
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Membre non trouvé dans ce projet');
    }
    return this.projectsService.findOne(
      projectId,
      userId,
      userRole,
      expectedWorkspaceId,
    );
  }

  /**
   * Retourne les membres d'un projet si l'utilisateur y a accès.
   */
  async getMembers(
    projectId: string,
    userId: string,
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<ProjectWithMembers['members']> {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.READ,
      expectedWorkspaceId,
    );

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { joinedAt: 'asc' },
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
    });

    return members;
  }
}

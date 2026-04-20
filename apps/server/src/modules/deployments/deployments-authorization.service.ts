import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DeploymentsAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getActor(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return user;
  }

  async assertCanAccessProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.resolveProjectMemberRole(projectId, userId, userRole);
  }

  async assertCanDeployProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    const memberRole = await this.resolveProjectMemberRole(
      projectId,
      userId,
      userRole,
    );

    if (memberRole === null) {
      return;
    }

    if (
      memberRole === ProjectRole.OWNER ||
      memberRole === ProjectRole.DEVELOPER
    ) {
      return;
    }

    throw new ForbiddenException(
      'Action réservée aux OWNER/DEVELOPER du projet ou ADMIN',
    );
  }

  async assertCanRollbackProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    const memberRole = await this.resolveProjectMemberRole(
      projectId,
      userId,
      userRole,
    );

    if (memberRole === null) {
      return;
    }

    if (memberRole === ProjectRole.OWNER) {
      return;
    }

    throw new ForbiddenException('Action réservée au OWNER du projet ou ADMIN');
  }

  async resolveProjectMemberRole(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<ProjectRole | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    if (userRole === Role.ADMIN) {
      return null;
    }

    const member = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      select: {
        role: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('Accès non autorisé à ce projet');
    }

    return member.role;
  }
}

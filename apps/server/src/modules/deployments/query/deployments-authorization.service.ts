import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role, type User } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';

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

  /**
   * Enforces environment-level protection. When an environment has
   * `isProtected = true`, only platform ADMINs and project OWNERs may deploy.
   * A project DEVELOPER is blocked regardless of project membership.
   */
  async assertCanDeployToEnvironment(
    projectId: string,
    environmentId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    const environment = await this.prisma.environment.findUnique({
      where: { id: environmentId },
      select: { isProtected: true },
    });

    if (!environment?.isProtected) {
      return;
    }

    // Environment is protected — ADMIN role always passes.
    if (userRole === Role.ADMIN) {
      return;
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });

    if (member?.role === ProjectRole.OWNER) {
      return;
    }

    throw new ForbiddenException(
      'Cet environnement est protégé. Seuls les OWNER du projet ou les ADMIN peuvent y déployer.',
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

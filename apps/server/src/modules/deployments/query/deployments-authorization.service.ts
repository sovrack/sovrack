import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectRole, Role, type User } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';
import { ProjectActions } from '../../iam/authorization/workspace-policy.types';

@Injectable()
export class DeploymentsAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

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
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    await this.assertProjectAction(
      projectId,
      userId,
      ProjectActions.READ,
      expectedWorkspaceId,
    );
  }

  async assertCanDeployProject(
    projectId: string,
    userId: string,
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    await this.assertProjectAction(
      projectId,
      userId,
      ProjectActions.DEPLOY,
      expectedWorkspaceId,
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
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    const environment = await this.prisma.environment.findUnique({
      where: { id: environmentId },
      select: { isProtected: true, projectId: true },
    });

    if (!environment || environment.projectId !== projectId) {
      throw new NotFoundException('Environnement introuvable');
    }
    if (!environment.isProtected) {
      return;
    }
    await this.assertProjectAction(
      projectId,
      userId,
      ProjectActions.DEPLOY_PROTECTED,
      expectedWorkspaceId,
    );
  }

  async assertCanRollbackProject(
    projectId: string,
    userId: string,
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    await this.assertProjectAction(
      projectId,
      userId,
      ProjectActions.ROLLBACK,
      expectedWorkspaceId,
    );
  }

  async resolveProjectMemberRole(
    projectId: string,
    userId: string,
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<ProjectRole | null> {
    const context = await this.assertProjectAction(
      projectId,
      userId,
      ProjectActions.READ,
      expectedWorkspaceId,
    );
    return context.effectiveProjectRole;
  }

  private assertProjectAction(
    projectId: string,
    userId: string,
    action: Parameters<WorkspaceAccessService['assertProjectAction']>[2],
    expectedWorkspaceId?: string,
  ) {
    return expectedWorkspaceId
      ? this.workspaceAccess.assertProjectAction(
          projectId,
          userId,
          action,
          expectedWorkspaceId,
        )
      : this.workspaceAccess.assertProjectAction(projectId, userId, action);
  }
}

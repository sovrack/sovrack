import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';
import { ProjectActions } from '../../iam/authorization/workspace-policy.types';
import type { ProjectActorContext } from '../../iam/authorization/workspace-policy.types';

/**
 * Single source of truth for project-scoped authorization across the catalog
 * (projects / environments / services / service-environments). Previously each
 * service carried its own copy of these checks. Workspace OWNER/ADMIN inherit
 * MAINTAINER; a workspace MEMBER needs an explicit project membership.
 */
@Injectable()
export class ProjectAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
  }

  /** Any project member may read the project. */
  async assertCanAccessProject(
    projectId: string,
    userId: string,
    _userRole: Role,
  ): Promise<void> {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.READ,
    );
  }

  /** Only the project OWNER may mutate the project. */
  async assertCanManageProject(
    projectId: string,
    userId: string,
    _userRole: Role,
  ): Promise<void> {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.UPDATE,
    );
  }

  async assertCanManageProjectWithContext(
    projectId: string,
    userId: string,
    _userRole: Role,
  ): Promise<ProjectActorContext> {
    return this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.UPDATE,
    );
  }

  async assertCanReadProjectSecrets(
    projectId: string,
    userId: string,
    _userRole: Role,
  ): Promise<ProjectActorContext> {
    return this.workspaceAccess.assertProjectAction(
      projectId,
      userId,
      ProjectActions.READ_SECRETS,
    );
  }
}

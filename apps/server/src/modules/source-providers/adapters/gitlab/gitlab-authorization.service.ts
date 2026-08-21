import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { WorkspaceAccessService } from '../../../iam/authorization/workspace-access.service';
import { ProjectActions } from '../../../iam/authorization/workspace-policy.types';

@Injectable()
export class GitlabAuthorizationService {
  constructor(private readonly workspaceAccess: WorkspaceAccessService) {}

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
}

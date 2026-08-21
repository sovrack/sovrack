import { Role } from '@prisma/client';
import { WorkspaceAccessService } from '../../../iam/authorization/workspace-access.service';
import { ProjectActions } from '../../../iam/authorization/workspace-policy.types';
import { GitlabAuthorizationService } from './gitlab-authorization.service';

describe('GitlabAuthorizationService', () => {
  const workspaceAccess = {
    assertProjectAction: jest.fn().mockResolvedValue({}),
  };
  const service = new GitlabAuthorizationService(
    workspaceAccess as unknown as WorkspaceAccessService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('uses the central read policy for GitLab reads', async () => {
    await service.assertCanAccessProject('project-1', 'user-1', Role.MEMBER);

    expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      ProjectActions.READ,
    );
  });

  it('uses the central update policy for GitLab configuration', async () => {
    await service.assertCanManageProject('project-1', 'user-1', Role.MEMBER);

    expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      ProjectActions.UPDATE,
    );
  });
});

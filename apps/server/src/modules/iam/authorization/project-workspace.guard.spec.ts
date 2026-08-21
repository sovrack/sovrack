import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ProjectWorkspaceGuard } from './project-workspace.guard';
import { ProjectActions } from './workspace-policy.types';

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

describe('ProjectWorkspaceGuard', () => {
  function make() {
    const workspaceAccess = {
      resolveWorkspaceId: jest.fn().mockResolvedValue('workspace-1'),
      assertProjectAction: jest.fn().mockResolvedValue({}),
    };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(null) };
    return {
      guard: new ProjectWorkspaceGuard(
        workspaceAccess as never,
        reflector as never,
      ),
      workspaceAccess,
      reflector,
    };
  }

  it('binds the project to the explicit workspace path', async () => {
    const { guard, workspaceAccess } = make();
    const request = {
      user: { id: 'user-1' },
      params: { workspaceId: 'workspace-1', projectId: 'project-1' },
      headers: {},
    };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      ProjectActions.READ,
      'workspace-1',
    );
    expect(request).toHaveProperty('workspaceId', 'workspace-1');
  });

  it('supports legacy routes through x-workspace-id', async () => {
    const { guard, workspaceAccess } = make();
    await guard.canActivate(
      context({
        user: { id: 'user-1' },
        params: { id: 'project-1' },
        headers: { 'x-workspace-id': 'workspace-1' },
      }),
    );
    expect(workspaceAccess.resolveWorkspaceId).toHaveBeenCalledWith(
      'user-1',
      'workspace-1',
    );
  });

  it('propagates a 404 for a project/workspace mismatch', async () => {
    const { guard, workspaceAccess } = make();
    workspaceAccess.assertProjectAction.mockRejectedValueOnce(
      new NotFoundException('Projet introuvable'),
    );
    await expect(
      guard.canActivate(
        context({
          user: { id: 'user-1' },
          params: { workspaceId: 'workspace-2', id: 'project-1' },
          headers: {},
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails closed when a protected route has no project id', async () => {
    const { guard, workspaceAccess } = make();
    await expect(
      guard.canActivate(
        context({ user: { id: 'user-1' }, params: {}, headers: {} }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(workspaceAccess.resolveWorkspaceId).not.toHaveBeenCalled();
  });

  it('uses the action required by the route metadata', async () => {
    const { guard, workspaceAccess, reflector } = make();
    reflector.getAllAndOverride.mockReturnValueOnce(ProjectActions.UPDATE);
    await guard.canActivate(
      context({
        user: { id: 'user-1' },
        params: { workspaceId: 'workspace-1', projectId: 'project-1' },
        headers: {},
      }),
    );
    expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      ProjectActions.UPDATE,
      'workspace-1',
    );
  });
});

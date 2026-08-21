import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';
import { ProjectActions } from '../../iam/authorization/workspace-policy.types';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';

describe('DeploymentsAuthorizationService', () => {
  let prisma: {
    user: { findUnique: jest.Mock };
    environment: { findUnique: jest.Mock };
  };
  let workspaceAccess: { assertProjectAction: jest.Mock };
  let service: DeploymentsAuthorizationService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      environment: { findUnique: jest.fn() },
    };
    workspaceAccess = {
      assertProjectAction: jest.fn().mockResolvedValue({
        effectiveProjectRole: ProjectRole.MAINTAINER,
      }),
    };
    service = new DeploymentsAuthorizationService(
      prisma as unknown as PrismaService,
      workspaceAccess as unknown as WorkspaceAccessService,
    );
  });

  describe('getActor', () => {
    it('returns the user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      expect(await service.getActor('u1')).toMatchObject({ id: 'u1' });
    });

    it('throws NotFound when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getActor('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('resolveProjectMemberRole', () => {
    it('hides a missing or foreign project', async () => {
      workspaceAccess.assertProjectAction.mockRejectedValueOnce(
        new NotFoundException('Projet introuvable'),
      );
      await expect(
        service.resolveProjectMemberRole('px', 'u1', Role.MEMBER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the effective role calculated by the central policy', async () => {
      workspaceAccess.assertProjectAction.mockResolvedValueOnce({
        effectiveProjectRole: ProjectRole.DEVELOPER,
      });
      await expect(
        service.resolveProjectMemberRole('p1', 'u1', Role.MEMBER),
      ).resolves.toBe(ProjectRole.DEVELOPER);
    });
  });

  describe('project actions', () => {
    it('uses DEPLOY and forwards workspace context', async () => {
      await service.assertCanDeployProject(
        'p1',
        'u1',
        Role.MEMBER,
        'workspace-1',
      );
      expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
        'p1',
        'u1',
        ProjectActions.DEPLOY,
        'workspace-1',
      );
    });

    it('propagates policy denial for a viewer', async () => {
      workspaceAccess.assertProjectAction.mockRejectedValueOnce(
        new ForbiddenException('Action projet interdite'),
      );
      await expect(
        service.assertCanDeployProject('p1', 'viewer', Role.MEMBER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('uses ROLLBACK for rollback authorization', async () => {
      await service.assertCanRollbackProject('p1', 'u1', Role.MEMBER);
      expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
        'p1',
        'u1',
        ProjectActions.ROLLBACK,
      );
    });
  });

  describe('assertCanDeployToEnvironment', () => {
    it('passes without an elevated check when the environment is not protected', async () => {
      prisma.environment.findUnique.mockResolvedValue({
        projectId: 'p1',
        isProtected: false,
      });
      await expect(
        service.assertCanDeployToEnvironment('p1', 'e1', 'u1', Role.MEMBER),
      ).resolves.toBeUndefined();
      expect(workspaceAccess.assertProjectAction).not.toHaveBeenCalled();
    });

    it('404s when the environment belongs to another project', async () => {
      prisma.environment.findUnique.mockResolvedValue({
        projectId: 'p2',
        isProtected: false,
      });
      await expect(
        service.assertCanDeployToEnvironment('p1', 'e1', 'u1', Role.MEMBER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('uses DEPLOY_PROTECTED for a protected environment', async () => {
      prisma.environment.findUnique.mockResolvedValue({
        projectId: 'p1',
        isProtected: true,
      });
      await service.assertCanDeployToEnvironment(
        'p1',
        'e1',
        'u1',
        Role.MEMBER,
        'workspace-1',
      );
      expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
        'p1',
        'u1',
        ProjectActions.DEPLOY_PROTECTED,
        'workspace-1',
      );
    });

    it('propagates denial for protected deployment', async () => {
      prisma.environment.findUnique.mockResolvedValue({
        projectId: 'p1',
        isProtected: true,
      });
      workspaceAccess.assertProjectAction.mockRejectedValueOnce(
        new ForbiddenException('Action projet interdite'),
      );
      await expect(
        service.assertCanDeployToEnvironment('p1', 'e1', 'u1', Role.MEMBER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

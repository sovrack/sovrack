import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';

/**
 * The multi-tenant RBAC core: project-scoped roles (OWNER/DEVELOPER/VIEWER) +
 * environment protection. ADMIN (platform role) bypasses project membership.
 */
describe('DeploymentsAuthorizationService', () => {
  let prisma: {
    user: { findUnique: jest.Mock };
    project: { findUnique: jest.Mock };
    projectMember: { findUnique: jest.Mock };
    environment: { findUnique: jest.Mock };
  };
  let svc: DeploymentsAuthorizationService;

  let projectAccess: { assertCanAccessProject: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', members: [] }),
      },
      projectMember: { findUnique: jest.fn() },
      environment: { findUnique: jest.fn() },
    };
    projectAccess = {
      assertCanAccessProject: jest.fn().mockResolvedValue(undefined),
    };
    svc = new DeploymentsAuthorizationService(
      prisma as unknown as PrismaService,
      projectAccess as never,
    );
  });

  /**
   * resolveProjectMemberRole() reads project.members[0].role (via Prisma
   * include with where:{userId}), NOT projectMember.findUnique(). We must mock
   * project.findUnique to return the members array — otherwise
   * project.members[0] is undefined and throws a TypeError instead of the
   * expected ForbiddenException.
   */
  const asMember = (role: ProjectRole) =>
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      members: [{ role }],
    });

  /**
   * assertCanDeployToEnvironment uses prisma.projectMember.findUnique directly
   * (not through project.members). This helper mocks both paths so tests for
   * that method work correctly regardless of which Prisma call is triggered.
   */
  const asDirectMember = (role: ProjectRole) => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      members: [{ role }],
    });
    prisma.projectMember.findUnique.mockResolvedValue({ role });
  };

  describe('getActor', () => {
    it('returns the user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      expect(await svc.getActor('u1')).toMatchObject({ id: 'u1' });
    });
    it('throws NotFound when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.getActor('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('resolveProjectMemberRole', () => {
    it('throws NotFound when the project is missing', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(
        svc.resolveProjectMemberRole('px', 'u1', Role.MEMBER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
    it('throws Forbidden for a SUPER_ADMIN who is not a member', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        members: [],
      });
      await expect(
        svc.resolveProjectMemberRole('p1', 'admin', Role.SUPER_ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('returns the member role for a project member', async () => {
      asMember(ProjectRole.OWNER);
      expect(await svc.resolveProjectMemberRole('p1', 'u1', Role.MEMBER)).toBe(
        ProjectRole.OWNER,
      );
    });
    it('throws Forbidden for a non-member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);
      await expect(
        svc.resolveProjectMemberRole('p1', 'stranger', Role.MEMBER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertCanDeployProject', () => {
    it('denies a SUPER_ADMIN who is not a member', async () => {
      await expect(
        svc.assertCanDeployProject('p1', 'a', Role.SUPER_ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('allows project OWNER and DEVELOPER', async () => {
      asMember(ProjectRole.OWNER);
      await expect(
        svc.assertCanDeployProject('p1', 'u', Role.MEMBER),
      ).resolves.toBeUndefined();
      asMember(ProjectRole.DEVELOPER);
      await expect(
        svc.assertCanDeployProject('p1', 'u', Role.MEMBER),
      ).resolves.toBeUndefined();
    });
    it('denies a project VIEWER', async () => {
      asMember(ProjectRole.VIEWER);
      await expect(
        svc.assertCanDeployProject('p1', 'u', Role.MEMBER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertCanRollbackProject', () => {
    it('allows only OWNER (and project owner)', async () => {
      asMember(ProjectRole.OWNER);
      await expect(
        svc.assertCanRollbackProject('p1', 'u', Role.MEMBER),
      ).resolves.toBeUndefined();
    });
    it('denies a SUPER_ADMIN who is not a member', async () => {
      await expect(
        svc.assertCanRollbackProject('p1', 'a', Role.SUPER_ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('denies a project DEVELOPER', async () => {
      asMember(ProjectRole.DEVELOPER);
      await expect(
        svc.assertCanRollbackProject('p1', 'u', Role.MEMBER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertCanDeployToEnvironment', () => {
    it('passes when the environment is not protected', async () => {
      prisma.environment.findUnique.mockResolvedValue({ isProtected: false });
      await expect(
        svc.assertCanDeployToEnvironment('p1', 'e1', 'u', Role.MEMBER),
      ).resolves.toBeUndefined();
    });
    it('protected env: SUPER_ADMIN who is not a member is denied', async () => {
      prisma.environment.findUnique.mockResolvedValue({ isProtected: true });
      prisma.projectMember.findUnique.mockResolvedValue(null);
      await expect(
        svc.assertCanDeployToEnvironment('p1', 'e1', 'a', Role.SUPER_ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('protected env: project OWNER passes', async () => {
      prisma.environment.findUnique.mockResolvedValue({ isProtected: true });
      asDirectMember(ProjectRole.OWNER);
      await expect(
        svc.assertCanDeployToEnvironment('p1', 'e1', 'u', Role.MEMBER),
      ).resolves.toBeUndefined();
    });
    it('protected env: project DEVELOPER is denied', async () => {
      prisma.environment.findUnique.mockResolvedValue({ isProtected: true });
      asDirectMember(ProjectRole.DEVELOPER);
      await expect(
        svc.assertCanDeployToEnvironment('p1', 'e1', 'u', Role.MEMBER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

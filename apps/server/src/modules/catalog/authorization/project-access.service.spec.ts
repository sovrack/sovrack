import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { ProjectAccessService } from './project-access.service';
import { PrismaService } from '../../../shared/database/prisma.service';

describe('ProjectAccessService', () => {
  function make(opts: { project?: unknown; member?: unknown } = {}) {
    const prisma = {
      project: {
        findUnique: jest
          .fn()
          .mockResolvedValue('project' in opts ? opts.project : { id: 'p1' }),
      },
      projectMember: {
        findUnique: jest.fn().mockResolvedValue(opts.member ?? null),
      },
    };
    return {
      svc: new ProjectAccessService(prisma as unknown as PrismaService),
      prisma,
    };
  }

  it('ensureProjectExists throws when the project is missing', async () => {
    const { svc } = make({ project: null });
    await expect(svc.ensureProjectExists('p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('assertCanAccessProject', () => {
    it('forbids a platform SUPER_ADMIN who is not a member', async () => {
      const { svc, prisma } = make();
      await expect(
        svc.assertCanAccessProject('p1', 'u1', Role.SUPER_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.projectMember.findUnique).toHaveBeenCalled();
    });

    it('allows any member', async () => {
      const { svc } = make({ member: { role: ProjectRole.VIEWER } });
      await expect(
        svc.assertCanAccessProject('p1', 'u1', Role.MEMBER),
      ).resolves.toBeUndefined();
    });

    it('forbids a non-member', async () => {
      const { svc } = make({ member: null });
      await expect(
        svc.assertCanAccessProject('p1', 'u1', Role.MEMBER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids an OWNER who is not a member (tenant isolation)', async () => {
      const { svc } = make({ member: null });
      await expect(
        svc.assertCanAccessProject('p1', 'u1', Role.OWNER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertCanManageProject', () => {
    it('allows the OWNER', async () => {
      const { svc } = make({ member: { role: ProjectRole.OWNER } });
      await expect(
        svc.assertCanManageProject('p1', 'u1', Role.MEMBER),
      ).resolves.toBeUndefined();
    });

    it('forbids a non-OWNER member (e.g. DEVELOPER)', async () => {
      const { svc } = make({ member: { role: ProjectRole.DEVELOPER } });
      await expect(
        svc.assertCanManageProject('p1', 'u1', Role.MEMBER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

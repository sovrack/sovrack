import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { GitlabAdapter } from '../../../source-providers/adapters/gitlab/gitlab.adapter';
import { ProjectsService } from '../projects.service';
import { AuditService } from '../../../audit/audit.service';
import { UsageGuardService } from '../../../billing/usage-guard.service';
import { WorkspaceAccessService } from '../../../iam/authorization/workspace-access.service';
import { ProjectImportService } from './project-import.service';

const repo = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'api',
  pathWithNamespace: 'grp/api',
  defaultBranch: 'main',
  ...over,
});

describe('ProjectImportService.importGitlabGroup', () => {
  let prisma: {
    $transaction: jest.Mock;
    user: { findUnique: jest.Mock };
    project: {
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      delete: jest.Mock;
    };
    environment: { create: jest.Mock };
    service: { create: jest.Mock };
    serviceEnvironment: { create: jest.Mock };
    projectMember: { create: jest.Mock };
  };
  let gitlab: {
    listGroupRepositoriesByProvider: jest.Mock;
    listProjectBranchesByProvider: jest.Mock;
    connectProject: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let workspaceAccess: {
    resolveWorkspaceId: jest.Mock;
    assertWorkspaceAction: jest.Mock;
    assertUserIsActiveMember: jest.Mock;
  };
  let usageGuard: { guardForTeam: jest.Mock };
  let service: ProjectImportService;

  const baseDto = {
    name: 'Imported',
    groupId: 'grp',
    providerId: 'prov1',
    importMode: 'SEPARATE_PROJECTS',
    repositories: [repo()],
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'o1', role: Role.MEMBER }),
      },
      project: {
        create: jest.fn().mockResolvedValue({ id: 'p1', members: [] }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'p1', members: [] }),
        delete: jest.fn().mockResolvedValue({}),
      },
      environment: { create: jest.fn().mockResolvedValue({ id: 'env1' }) },
      service: { create: jest.fn().mockResolvedValue({ id: 'svc1' }) },
      serviceEnvironment: {
        create: jest.fn().mockResolvedValue({ id: 'se1' }),
      },
      projectMember: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    gitlab = {
      listGroupRepositoriesByProvider: jest.fn().mockResolvedValue([]),
      listProjectBranchesByProvider: jest
        .fn()
        .mockResolvedValue([{ name: 'main' }]),
      connectProject: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    workspaceAccess = {
      resolveWorkspaceId: jest.fn().mockResolvedValue('workspace-1'),
      assertWorkspaceAction: jest.fn().mockResolvedValue(undefined),
      assertUserIsActiveMember: jest.fn().mockResolvedValue(undefined),
    };
    usageGuard = { guardForTeam: jest.fn().mockResolvedValue(undefined) };
    service = new ProjectImportService(
      prisma as unknown as PrismaService,
      gitlab as unknown as GitlabAdapter,
      {} as unknown as ProjectsService,
      audit as unknown as AuditService,
      workspaceAccess as unknown as WorkspaceAccessService,
      usageGuard as unknown as UsageGuardService,
    );
  });

  it('rejects a duplicate repository selection', async () => {
    await expect(
      service.importGitlabGroup('u1', Role.OWNER, {
        ...baseDto,
        repositories: [repo({ id: 1 }), repo({ id: 1 })],
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('forbids a caller without workspace create-project permission', async () => {
    workspaceAccess.assertWorkspaceAction.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(
      service.importGitlabGroup('u1', Role.MEMBER, {
        ...baseDto,
        ownerId: 'someone-else',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the assigned owner is not an active workspace member', async () => {
    workspaceAccess.assertUserIsActiveMember.mockRejectedValue(
      new NotFoundException(),
    );
    await expect(
      service.importGitlabGroup('admin', Role.OWNER, {
        ...baseDto,
        ownerId: 'ghost',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('conflicts when a repo default branch does not exist on GitLab', async () => {
    gitlab.listProjectBranchesByProvider.mockResolvedValue([
      { name: 'master' },
    ]);
    await expect(
      service.importGitlabGroup('admin', Role.OWNER, baseDto as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('imports SEPARATE_PROJECTS: creates project/env/service, connects, audits', async () => {
    const res = await service.importGitlabGroup(
      'admin',
      Role.OWNER,
      baseDto as never,
    );
    expect(prisma.project.create).toHaveBeenCalled();
    expect(prisma.service.create).toHaveBeenCalled();
    expect(gitlab.connectProject).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
    expect(res.projects).toHaveLength(1);
  });

  it('rolls back created projects when an import step throws', async () => {
    gitlab.connectProject.mockRejectedValue(new Error('connect failed'));
    await expect(
      service.importGitlabGroup('admin', Role.OWNER, baseDto as never),
    ).rejects.toThrow('connect failed');
    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});

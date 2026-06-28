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
    user: { findUnique: jest.Mock };
    project: {
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      delete: jest.Mock;
    };
    environment: { create: jest.Mock };
    service: { create: jest.Mock };
    serviceEnvironment: { create: jest.Mock };
  };
  let gitlab: {
    listGroupRepositoriesByProvider: jest.Mock;
    listProjectBranchesByProvider: jest.Mock;
    connectProject: jest.Mock;
  };
  let audit: { record: jest.Mock };
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
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'o1', role: Role.DEVELOPER }),
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
    };
    gitlab = {
      listGroupRepositoriesByProvider: jest.fn().mockResolvedValue([]),
      listProjectBranchesByProvider: jest
        .fn()
        .mockResolvedValue([{ name: 'main' }]),
      connectProject: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ProjectImportService(
      prisma as unknown as PrismaService,
      gitlab as unknown as GitlabAdapter,
      {} as unknown as ProjectsService,
      audit as unknown as AuditService,
    );
  });

  it('rejects a duplicate repository selection', async () => {
    await expect(
      service.importGitlabGroup('u1', Role.ADMIN, {
        ...baseDto,
        repositories: [repo({ id: 1 }), repo({ id: 1 })],
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('forbids a non-admin from assigning a different owner', async () => {
    await expect(
      service.importGitlabGroup('u1', Role.DEVELOPER, {
        ...baseDto,
        ownerId: 'someone-else',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the assigned owner does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.importGitlabGroup('admin', Role.ADMIN, {
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
      service.importGitlabGroup('admin', Role.ADMIN, baseDto as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('imports SEPARATE_PROJECTS: creates project/env/service, connects, audits', async () => {
    const res = await service.importGitlabGroup(
      'admin',
      Role.ADMIN,
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
      service.importGitlabGroup('admin', Role.ADMIN, baseDto as never),
    ).rejects.toThrow('connect failed');
    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SourceProvidersService } from '../source-providers/source-providers.service';
import { PreviewEnvironmentService } from './preview-environment.service';

describe('PreviewEnvironmentService', () => {
  let prisma: {
    project: { findUnique: jest.Mock };
    service: { findMany: jest.Mock };
    environment: { findFirst: jest.Mock; create: jest.Mock };
    serviceEnvironment: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let postComment: jest.Mock;
  let providers: { forProject: jest.Mock };
  let service: PreviewEnvironmentService;

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
      service: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1' }, { id: 's2' }]),
      },
      environment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'env-mr-42' }),
      },
      serviceEnvironment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: `se-${data.serviceId}` }),
          ),
        update: jest.fn().mockResolvedValue({ id: 'se-existing' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'se-1' }, { id: 'se-2' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    postComment = jest.fn().mockResolvedValue(undefined);
    providers = { forProject: jest.fn().mockResolvedValue({ postComment }) };
    service = new PreviewEnvironmentService(
      prisma as unknown as PrismaService,
      providers as unknown as SourceProvidersService,
    );
  });

  it('creates a per-MR environment + preview service-environments and comments', async () => {
    const result = await service.openPreview('p1', '42', 'feature/login');

    expect(prisma.environment.create).toHaveBeenCalledWith({
      data: { projectId: 'p1', name: 'preview-mr-42' },
    });
    expect(prisma.serviceEnvironment.create).toHaveBeenCalledTimes(2);
    expect(
      prisma.serviceEnvironment.create.mock.calls[0][0].data,
    ).toMatchObject({
      isPreview: true,
      previewMrId: '42',
      previewBranch: 'feature/login',
      branch: 'feature/login',
    });
    expect(result.serviceEnvironmentIds).toEqual(['se-s1', 'se-s2']);
    expect(postComment).toHaveBeenCalledWith(
      'p1',
      '42',
      expect.stringContaining('feature/login'),
    );
  });

  it('reuses an existing preview service-environment (un-archives it)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({ id: 'se-old' });
    await service.openPreview('p1', '42', 'feature/login');
    expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith({
      where: { id: 'se-old' },
      data: expect.objectContaining({ archivedAt: null, previewMrId: '42' }),
    });
    expect(prisma.serviceEnvironment.create).not.toHaveBeenCalled();
  });

  it('rejects a project with no application services', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    await expect(service.openPreview('p1', '42', 'b')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when the project does not exist', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(
      service.openPreview('missing', '42', 'b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('closePreview soft-deletes preview service-environments', async () => {
    const res = await service.closePreview('p1', '42');
    expect(prisma.serviceEnvironment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['se-1', 'se-2'] } },
      data: { archivedAt: expect.any(Date) },
    });
    expect(res.closed).toBe(2);
  });

  it('does not fail openPreview when the MR comment errors', async () => {
    providers.forProject.mockRejectedValue(new Error('no provider'));
    await expect(service.openPreview('p1', '42', 'b')).resolves.toBeDefined();
  });
});

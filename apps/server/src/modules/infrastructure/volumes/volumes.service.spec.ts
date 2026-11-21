import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { VolumesService } from './volumes.service';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';

describe('VolumesService', () => {
  let prisma: {
    volume: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    service: { findFirst: jest.Mock };
  };
  let workspaceAccess: {
    resolveWorkspaceId: jest.Mock;
    assertWorkspaceAction: jest.Mock;
    assertServerAction: jest.Mock;
  };
  let svc: VolumesService;

  beforeEach(() => {
    prisma = {
      volume: {
        findFirst: jest.fn().mockResolvedValue({ id: 'v1' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'v1' }),
        update: jest.fn().mockResolvedValue({ id: 'v1' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      service: { findFirst: jest.fn().mockResolvedValue({ id: 'svc1' }) },
    };
    workspaceAccess = {
      resolveWorkspaceId: jest.fn().mockResolvedValue('workspace-1'),
      assertWorkspaceAction: jest.fn().mockResolvedValue(undefined),
      assertServerAction: jest.fn().mockResolvedValue(undefined),
    };
    svc = new VolumesService(
      prisma as unknown as PrismaService,
      workspaceAccess as unknown as WorkspaceAccessService,
    );
  });

  describe('findOne', () => {
    it('returns the volume', async () => {
      expect(await svc.findOne('v1', 'user-1', 'workspace-1')).toEqual({
        id: 'v1',
      });
      expect(prisma.volume.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'v1',
          server: { teamId: 'workspace-1' },
        },
      });
    });
    it('throws NotFound when missing', async () => {
      prisma.volume.findFirst.mockResolvedValue(null);
      await expect(
        svc.findOne('ghost', 'user-1', 'workspace-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('trims the name and maps optional fields to null', async () => {
      await svc.create(
        {
          name: '  data  ',
          serverId: 'srv1',
        },
        'user-1',
        'workspace-1',
      );
      expect(workspaceAccess.assertServerAction).toHaveBeenCalledWith(
        'srv1',
        'user-1',
        'server.manage',
        'workspace-1',
      );
      expect(prisma.volume.create).toHaveBeenCalledWith({
        data: {
          name: 'data',
          serverId: 'srv1',
          mountPath: null,
          sizeGb: null,
          serviceId: null,
        },
      });
    });
  });

  describe('update', () => {
    it('guards with 404 then applies only the provided fields', async () => {
      await svc.update('v1', { sizeGb: 20 }, 'user-1', 'workspace-1');
      expect(prisma.volume.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { sizeGb: 20 },
      });
    });
    it('rejects (404) an unknown volume before updating', async () => {
      prisma.volume.findFirst.mockResolvedValue(null);
      await expect(
        svc.update('ghost', { sizeGb: 1 }, 'user-1', 'workspace-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.volume.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('guards with 404 then deletes', async () => {
      await svc.remove('v1', 'user-1', 'workspace-1');
      expect(prisma.volume.delete).toHaveBeenCalledWith({
        where: { id: 'v1' },
      });
    });
    it('rejects (404) an unknown volume before deleting', async () => {
      prisma.volume.findFirst.mockResolvedValue(null);
      await expect(
        svc.remove('ghost', 'user-1', 'workspace-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.volume.delete).not.toHaveBeenCalled();
    });
  });
});

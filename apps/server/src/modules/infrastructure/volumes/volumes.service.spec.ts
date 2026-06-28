import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { VolumesService } from './volumes.service';
import type { CreateVolumeDto, UpdateVolumeDto } from './dto/volume.dto';

describe('VolumesService', () => {
  let prisma: {
    volume: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let svc: VolumesService;

  beforeEach(() => {
    prisma = {
      volume: {
        findUnique: jest.fn().mockResolvedValue({ id: 'v1' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'v1' }),
        update: jest.fn().mockResolvedValue({ id: 'v1' }),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    svc = new VolumesService(prisma as unknown as PrismaService);
  });

  describe('findOne', () => {
    it('returns the volume', async () => {
      expect(await svc.findOne('v1')).toEqual({ id: 'v1' });
    });
    it('throws NotFound when missing', async () => {
      prisma.volume.findUnique.mockResolvedValue(null);
      await expect(svc.findOne('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('trims the name and maps optional fields to null', async () => {
      await svc.create({
        name: '  data  ',
        serverId: 'srv1',
      } as CreateVolumeDto);
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
      await svc.update('v1', { sizeGb: 20 } as UpdateVolumeDto);
      expect(prisma.volume.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { sizeGb: 20 },
      });
    });
    it('rejects (404) an unknown volume before updating', async () => {
      prisma.volume.findUnique.mockResolvedValue(null);
      await expect(
        svc.update('ghost', { sizeGb: 1 } as UpdateVolumeDto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.volume.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('guards with 404 then deletes', async () => {
      await svc.remove('v1');
      expect(prisma.volume.delete).toHaveBeenCalledWith({
        where: { id: 'v1' },
      });
    });
    it('rejects (404) an unknown volume before deleting', async () => {
      prisma.volume.findUnique.mockResolvedValue(null);
      await expect(svc.remove('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.volume.delete).not.toHaveBeenCalled();
    });
  });
});

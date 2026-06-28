import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CreateVolumeDto, UpdateVolumeDto } from './dto/volume.dto';

@Injectable()
export class VolumesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { serverId?: string; serviceId?: string }) {
    return this.prisma.volume.findMany({
      where: {
        ...(filters.serverId && { serverId: filters.serverId }),
        ...(filters.serviceId && { serviceId: filters.serviceId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const volume = await this.prisma.volume.findUnique({ where: { id } });
    if (!volume) throw new NotFoundException('Volume introuvable');
    return volume;
  }

  async create(dto: CreateVolumeDto) {
    return this.prisma.volume.create({
      data: {
        name: dto.name.trim(),
        serverId: dto.serverId,
        mountPath: dto.mountPath ?? null,
        sizeGb: dto.sizeGb ?? null,
        serviceId: dto.serviceId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateVolumeDto) {
    await this.findOne(id);
    return this.prisma.volume.update({
      where: { id },
      data: {
        ...(dto.mountPath !== undefined && { mountPath: dto.mountPath }),
        ...(dto.sizeGb !== undefined && { sizeGb: dto.sizeGb }),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.volume.delete({ where: { id } });
  }
}

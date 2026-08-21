import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CreateVolumeDto, UpdateVolumeDto } from './dto/volume.dto';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';
import {
  WorkspaceAction,
  WorkspaceActions,
} from '../../iam/authorization/workspace-policy.types';

@Injectable()
export class VolumesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async findAll(
    filters: { serverId?: string; serviceId?: string },
    userId: string,
    requestedWorkspaceId?: string,
  ) {
    const workspaceId = await this.authorizeWorkspace(
      userId,
      requestedWorkspaceId,
      WorkspaceActions.READ_SERVER,
    );
    if (filters.serverId) {
      await this.workspaceAccess.assertServerAction(
        filters.serverId,
        userId,
        WorkspaceActions.READ_SERVER,
        workspaceId,
      );
    }
    return this.prisma.volume.findMany({
      where: {
        server: { teamId: workspaceId },
        ...(filters.serverId && { serverId: filters.serverId }),
        ...(filters.serviceId && { serviceId: filters.serviceId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    id: string,
    userId: string,
    requestedWorkspaceId?: string,
    action: WorkspaceAction = WorkspaceActions.READ_SERVER,
  ) {
    const workspaceId = await this.authorizeWorkspace(
      userId,
      requestedWorkspaceId,
      action,
    );
    const volume = await this.prisma.volume.findFirst({
      where: { id, server: { teamId: workspaceId } },
    });
    if (!volume) throw new NotFoundException('Volume introuvable');
    return volume;
  }

  async create(
    dto: CreateVolumeDto,
    userId: string,
    requestedWorkspaceId?: string,
  ) {
    const workspaceId = await this.authorizeWorkspace(
      userId,
      requestedWorkspaceId,
      WorkspaceActions.MANAGE_SERVER,
    );
    await this.workspaceAccess.assertServerAction(
      dto.serverId,
      userId,
      WorkspaceActions.MANAGE_SERVER,
      workspaceId,
    );
    if (dto.serviceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: dto.serviceId, project: { teamId: workspaceId } },
        select: { id: true },
      });
      if (!service) throw new NotFoundException('Service introuvable');
    }
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

  async update(
    id: string,
    dto: UpdateVolumeDto,
    userId: string,
    requestedWorkspaceId?: string,
  ) {
    await this.findOne(
      id,
      userId,
      requestedWorkspaceId,
      WorkspaceActions.MANAGE_SERVER,
    );
    return this.prisma.volume.update({
      where: { id },
      data: {
        ...(dto.mountPath !== undefined && { mountPath: dto.mountPath }),
        ...(dto.sizeGb !== undefined && { sizeGb: dto.sizeGb }),
      },
    });
  }

  async remove(
    id: string,
    userId: string,
    requestedWorkspaceId?: string,
  ): Promise<void> {
    await this.findOne(
      id,
      userId,
      requestedWorkspaceId,
      WorkspaceActions.MANAGE_SERVER,
    );
    await this.prisma.volume.delete({ where: { id } });
  }

  private async authorizeWorkspace(
    userId: string,
    requestedWorkspaceId: string | undefined,
    action: WorkspaceAction,
  ): Promise<string> {
    const workspaceId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      userId,
      action,
    );
    return workspaceId;
  }
}

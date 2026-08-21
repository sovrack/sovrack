import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContainerStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { IDockerRuntime } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';
import { WorkspaceActions } from '../../iam/authorization/workspace-policy.types';

@Injectable()
export class ContainersService {
  private readonly logger = new Logger(ContainersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
    @Inject(DOCKER_RUNTIME) private readonly docker: IDockerRuntime,
  ) {}

  async assertCanAccessServerById(
    serverId: string,
    userId: string,
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    await this.workspaceAccess.assertServerAction(
      serverId,
      userId,
      WorkspaceActions.READ_SERVER,
      expectedWorkspaceId,
    );
  }

  async assertCanManageServerById(
    serverId: string,
    userId: string,
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    await this.workspaceAccess.assertServerAction(
      serverId,
      userId,
      WorkspaceActions.MANAGE_SERVER,
      expectedWorkspaceId,
    );
  }

  async assertCanAccessContainer(
    containerId: string,
    userId: string,
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    const container = await this.findOne(containerId);
    await this.workspaceAccess.assertServerAction(
      container.serverId,
      userId,
      WorkspaceActions.READ_SERVER,
      expectedWorkspaceId,
    );
  }

  async assertCanManageContainer(
    containerId: string,
    userId: string,
    _userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    const container = await this.findOne(containerId);
    await this.workspaceAccess.assertServerAction(
      container.serverId,
      userId,
      WorkspaceActions.MANAGE_SERVER,
      expectedWorkspaceId,
    );
  }

  async findAll(
    filters: {
      serverId?: string;
      serviceId?: string;
      deploymentId?: string;
      serviceEnvId?: string;
    },
    userId: string,
    _userRole: Role,
    requestedWorkspaceId?: string,
  ) {
    const workspaceId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      userId,
      WorkspaceActions.READ_SERVER,
    );
    if (filters.serverId)
      await this.workspaceAccess.assertServerAction(
        filters.serverId,
        userId,
        WorkspaceActions.READ_SERVER,
        workspaceId,
      );
    return this.prisma.container.findMany({
      where: {
        server: { teamId: workspaceId },
        ...(filters.serverId && { serverId: filters.serverId }),
        ...(filters.serviceId && { serviceId: filters.serviceId }),
        ...(filters.deploymentId && { deploymentId: filters.deploymentId }),
        ...(filters.serviceEnvId && { serviceEnvId: filters.serviceEnvId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const container = await this.prisma.container.findUnique({ where: { id } });
    if (!container) throw new NotFoundException('Container introuvable');
    return container;
  }

  async start(id: string): Promise<void> {
    const container = await this.findOne(id);
    await this.docker.startContainer(container.serverId, container.dockerId);
    await this.syncStatus(id, ContainerStatus.RUNNING);
  }

  async stop(id: string): Promise<void> {
    const container = await this.findOne(id);
    await this.docker.stopContainer(container.serverId, container.dockerId);
    await this.syncStatus(id, ContainerStatus.EXITED);
  }

  async restart(id: string): Promise<void> {
    const container = await this.findOne(id);
    await this.docker.restartContainer(container.serverId, container.dockerId);
    await this.syncStatus(id, ContainerStatus.RUNNING);
  }

  async remove(id: string): Promise<void> {
    const container = await this.findOne(id);
    await this.docker.removeContainer(
      container.serverId,
      container.dockerId,
      true,
    );
    await this.prisma.container.delete({ where: { id } });
  }

  async inspect(id: string) {
    const container = await this.findOne(id);
    return this.docker.inspectContainer(container.serverId, container.dockerId);
  }

  async getStats(id: string) {
    const container = await this.findOne(id);
    return this.docker.getContainerStats(
      container.serverId,
      container.dockerId,
    );
  }

  async syncFromDocker(serverId: string): Promise<number> {
    const live = await this.docker.listContainers(serverId, true);
    let synced = 0;
    for (const info of live) {
      const name = (info.Names[0] ?? info.Id.slice(0, 12)).replace(/^\//, '');
      const status = this.mapDockerStatus(info.State);
      const existing = await this.prisma.container.findFirst({
        where: { dockerId: info.Id, serverId },
      });
      if (existing) {
        await this.prisma.container.update({
          where: { id: existing.id },
          data: { status, lastSeenAt: new Date() },
        });
      } else {
        await this.prisma.container.create({
          data: {
            dockerId: info.Id,
            name,
            imageRef: info.Image,
            status,
            serverId,
            lastSeenAt: new Date(),
          },
        });
      }
      synced++;
    }
    this.logger.log(`Synced ${synced} containers from server ${serverId}`);
    return synced;
  }

  private async syncStatus(id: string, status: ContainerStatus): Promise<void> {
    await this.prisma.container.update({
      where: { id },
      data: { status, lastSeenAt: new Date() },
    });
  }

  private mapDockerStatus(state: string): ContainerStatus {
    const map: Record<string, ContainerStatus> = {
      created: ContainerStatus.CREATED,
      running: ContainerStatus.RUNNING,
      paused: ContainerStatus.PAUSED,
      restarting: ContainerStatus.RESTARTING,
      removing: ContainerStatus.REMOVING,
      exited: ContainerStatus.EXITED,
      dead: ContainerStatus.DEAD,
    };
    return map[state.toLowerCase()] ?? ContainerStatus.EXITED;
  }
}

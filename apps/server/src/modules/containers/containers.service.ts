import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ContainerStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { DockerApiService } from '../../core/docker/docker-api.service';

@Injectable()
export class ContainersService {
  private readonly logger = new Logger(ContainersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerApiService,
  ) {}

  async findAll(filters: { serverId?: string; serviceId?: string }) {
    return this.prisma.container.findMany({
      where: {
        ...(filters.serverId && { serverId: filters.serverId }),
        ...(filters.serviceId && { serviceId: filters.serviceId }),
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
    await this.docker.removeContainer(container.serverId, container.dockerId, true);
    await this.prisma.container.delete({ where: { id } });
  }

  async inspect(id: string) {
    const container = await this.findOne(id);
    return this.docker.inspectContainer(container.serverId, container.dockerId);
  }

  async getStats(id: string) {
    const container = await this.findOne(id);
    return this.docker.getContainerStats(container.serverId, container.dockerId);
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

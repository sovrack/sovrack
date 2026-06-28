import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/database/prisma.service';
import { NotificationsService } from '../notifications.service';
import {
  DOCKER_CONNECTION_RECOVERED,
  DOCKER_CONNECTION_UNREACHABLE,
  type DockerConnectionRecoveredEvent,
  type DockerConnectionUnreachableEvent,
} from '../../../adapters/container-runtime/docker-connection-health.service';

@Injectable()
export class DockerConnectionNotificationsListener {
  private readonly logger = new Logger(
    DockerConnectionNotificationsListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(DOCKER_CONNECTION_UNREACHABLE)
  async onUnreachable(event: DockerConnectionUnreachableEvent): Promise<void> {
    const serverName = await this.safeResolveServerName(event.serverId);
    try {
      await this.notifications.notifyDockerConnectionDown({
        serverId: event.serverId,
        ...(serverName ? { serverName } : {}),
        endpoint: event.endpoint,
        lastError: event.lastError,
        failedSince: event.failedSince,
      });
    } catch (err) {
      this.logger.warn(
        `notifyDockerConnectionDown failed for ${event.serverId}: ${
          err instanceof Error ? err.message : 'erreur inconnue'
        }`,
      );
    }
  }

  @OnEvent(DOCKER_CONNECTION_RECOVERED)
  async onRecovered(event: DockerConnectionRecoveredEvent): Promise<void> {
    const serverName = await this.safeResolveServerName(event.serverId);
    try {
      await this.notifications.notifyDockerConnectionRecovered({
        serverId: event.serverId,
        ...(serverName ? { serverName } : {}),
        endpoint: event.endpoint,
      });
    } catch (err) {
      this.logger.warn(
        `notifyDockerConnectionRecovered failed for ${event.serverId}: ${
          err instanceof Error ? err.message : 'erreur inconnue'
        }`,
      );
    }
  }

  private async safeResolveServerName(
    serverId: string,
  ): Promise<string | undefined> {
    try {
      const server = await this.prisma.server.findUnique({
        where: { id: serverId },
        select: { name: true },
      });
      return server?.name;
    } catch {
      return undefined;
    }
  }
}

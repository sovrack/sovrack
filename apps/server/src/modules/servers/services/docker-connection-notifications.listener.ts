import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  DOCKER_CONNECTION_RECOVERED,
  DOCKER_CONNECTION_UNREACHABLE,
  type DockerConnectionRecoveredEvent,
  type DockerConnectionUnreachableEvent,
} from '../../../core/docker/docker-connection-health.service';

/**
 * Bridges the in-process EventEmitter2 events from
 * {@link DockerConnectionHealthService} to the persistent Slack + email
 * channels exposed by {@link NotificationsService}.
 *
 * Listener-only (no logic of its own): the only thing it does is
 * hydrate the server name and forward to the notification service.
 */
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

  private async safeResolveServerName(serverId: string): Promise<string | undefined> {
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

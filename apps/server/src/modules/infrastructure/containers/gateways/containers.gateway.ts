import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { IDockerRuntime } from '../../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../../adapters/container-runtime/ports/docker-runtime.port';
import { ContainersService } from '../containers.service';
import { resolveGatewayCorsOrigins } from '../../../../shared/http/cors-origins.util';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import {
  AUTH_COOKIE_NAME_DEFAULT,
  extractTokenFromCookieHeader,
} from '../../../../shared/http/auth-cookie.util';

type LogStreamPayload = {
  containerId: string;
  tail?: number;
};

@WebSocketGateway({
  namespace: '/containers',
  cors: { origin: resolveGatewayCorsOrigins(), credentials: true },
})
export class ContainersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ContainersGateway.name);
  private readonly activeStreams = new Map<string, AbortController>();

  constructor(
    private readonly containersService: ContainersService,
    @Inject(DOCKER_RUNTIME) private readonly docker: IDockerRuntime,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket): void {
    const auth = client.handshake.auth as Record<string, unknown>;
    const cookieName = this.configService.get<string>(
      'AUTH_COOKIE_NAME',
      AUTH_COOKIE_NAME_DEFAULT,
    );
    const cookieToken = extractTokenFromCookieHeader(
      client.handshake.headers.cookie,
      cookieName,
    );
    const rawToken =
      cookieToken ??
      (auth.token as string | undefined) ??
      client.handshake.headers.authorization;
    const token =
      typeof rawToken === 'string'
        ? rawToken.replace(/^Bearer\s+/i, '').trim()
        : '';

    if (!token) {
      client.disconnect();
      return;
    }
    try {
      (client.data as { user: JwtPayload }).user =
        this.jwtService.verify<JwtPayload>(token);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.stopStream(client.id);
  }

  @SubscribeMessage('container:logs:start')
  async handleLogsStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LogStreamPayload,
  ): Promise<void> {
    this.stopStream(client.id);

    const user = (client.data as { user?: JwtPayload }).user;
    if (!user) {
      client.emit('container:error', {
        message: 'Utilisateur non authentifié',
      });
      return;
    }
    const auth = client.handshake.auth as Record<string, unknown>;
    const headerWorkspaceId = client.handshake.headers['x-workspace-id'];
    const requestedWorkspaceId =
      (typeof auth.workspaceId === 'string' && auth.workspaceId.trim()) ||
      (typeof headerWorkspaceId === 'string' && headerWorkspaceId.trim()) ||
      undefined;

    const container = await this.containersService
      .assertCanAccessContainer(
        payload.containerId,
        user.id,
        user.role,
        requestedWorkspaceId,
      )
      .then(() => this.containersService.findOne(payload.containerId))
      .catch(() => null);
    if (!container) {
      client.emit('container:error', { message: 'Container introuvable' });
      return;
    }

    const controller = new AbortController();
    this.activeStreams.set(client.id, controller);

    void (async () => {
      try {
        const stream = this.docker.streamContainerLogs(
          container.serverId,
          container.dockerId,
          {
            follow: true,
            tail: Math.min(1000, Math.max(1, payload.tail ?? 100)),
          },
        );
        for await (const entry of stream) {
          if (controller.signal.aborted) break;
          client.emit('container:log', entry);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const message =
            err instanceof Error ? err.message : 'Erreur log stream';
          this.logger.error(
            `Log stream error for container ${payload.containerId}: ${message}`,
          );
          client.emit('container:error', { message });
        }
      } finally {
        this.activeStreams.delete(client.id);
        client.emit('container:logs:end');
      }
    })();
  }

  @SubscribeMessage('container:logs:stop')
  handleLogsStop(@ConnectedSocket() client: Socket): void {
    this.stopStream(client.id);
    client.emit('container:logs:end');
  }

  private stopStream(clientId: string): void {
    const ctrl = this.activeStreams.get(clientId);
    if (ctrl) {
      ctrl.abort();
      this.activeStreams.delete(clientId);
    }
  }
}

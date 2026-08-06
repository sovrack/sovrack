import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
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
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import {
  extractTokenFromCookieHeader,
  AUTH_COOKIE_NAME_DEFAULT,
} from '../../../shared/http/auth-cookie.util';
import { resolveGatewayCorsOrigins } from '../../../shared/http/cors-origins.util';
import { DeploymentsLogStreamService } from '../query/deployments-log-stream.service';
import {
  DEPLOYMENT_WS_STARTED,
  DEPLOYMENT_WS_LOG,
  DEPLOYMENT_WS_STATUS,
  DEPLOYMENT_WS_FINISHED,
  type DeploymentStartedPayload,
  type DeploymentLogPayload,
  type DeploymentStatusPayload,
  type DeploymentFinishedPayload,
} from '../events/deployment-ws.events';

type JoinDeploymentPayload = {
  deploymentId?: string;
};

type RequestReplayPayload = {
  deploymentId?: string;
};

type DeploymentLogReplayPayload = {
  deploymentId: string;
  logs: DeploymentLogPayload[];
};

@Injectable()
@WebSocketGateway({
  namespace: '/deployments',
  cors: {
    origin: resolveGatewayCorsOrigins(),
    credentials: true,
  },
})
export class DeploymentsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DeploymentsGateway.name);

  @WebSocketServer()
  server!: Server;

  // In-memory ring buffer per deployment for replay after reconnection.
  // Cleared on emitFinished — persisted logs remain in DB for cold access.
  private readonly MAX_BUFFER_SIZE = 200;
  private readonly logBuffer = new Map<string, DeploymentLogPayload[]>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logStreamService: DeploymentsLogStreamService,
  ) {}

  // Vérifie le token JWT à chaque nouvelle connexion WebSocket.
  // Les clients sans token valide sont immédiatement déconnectés.
  handleConnection(client: Socket): void {
    const authData = client.handshake.auth as Record<string, unknown>;
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
      (authData.token as string | undefined) ??
      client.handshake.headers.authorization;

    // Supprimer le préfixe "Bearer " si présent.
    const token =
      typeof rawToken === 'string'
        ? rawToken.replace(/^Bearer\s+/i, '').trim()
        : null;

    if (!token) {
      this.logger.warn(
        `WebSocket: connexion rejetée — token absent (id: ${client.id})`,
      );
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      // Stocker l'utilisateur décodé pour usage ultérieur dans les événements.
      (client.data as { user: JwtPayload }).user = payload;
      this.logger.debug(
        `WebSocket: connexion acceptée — user ${payload.email} (id: ${client.id})`,
      );
    } catch {
      this.logger.warn(
        `WebSocket: connexion rejetée — token invalide (id: ${client.id})`,
      );
      client.disconnect();
    }
  }

  /**
   * On client disconnect, cancel any active log subscriptions for
   * this socket. The underlying TLS streams would otherwise stay
   * open until the next emit / timeout.
   */
  handleDisconnect(client: Socket): void {
    const cancelled = this.logStreamService.unsubscribeAll(client.id);
    if (cancelled > 0) {
      this.logger.debug(
        `WebSocket: déconnecté — ${cancelled} flux de logs annulés (id: ${client.id})`,
      );
    }
  }

  @SubscribeMessage('join:deployment')
  async handleJoinDeployment(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinDeploymentPayload,
  ): Promise<{ ok: boolean; deploymentId?: string; error?: string }> {
    const deploymentId = payload?.deploymentId?.trim();
    if (!deploymentId) {
      const message = 'deploymentId manquant';
      client.emit('deployment:error', { message });
      return { ok: false, error: message };
    }

    const user = (client.data as { user?: JwtPayload }).user;
    if (!user) {
      const message = 'Utilisateur non authentifié';
      client.emit('deployment:error', { deploymentId, message });
      return { ok: false, deploymentId, error: message };
    }

    const hasAccess = await this.canAccessDeployment(user, deploymentId);
    if (!hasAccess) {
      const message = 'Accès non autorisé à ce déploiement';
      client.emit('deployment:error', { deploymentId, message });
      return { ok: false, deploymentId, error: message };
    }

    await client.join(this.roomName(deploymentId));
    client.emit('deployment:joined', { deploymentId });
    return { ok: true, deploymentId };
  }

  @OnEvent(DEPLOYMENT_WS_STARTED)
  emitStarted(payload: DeploymentStartedPayload): void {
    this.server
      .to(this.roomName(payload.deploymentId))
      .emit('deployment:started', payload);
  }

  @OnEvent(DEPLOYMENT_WS_LOG)
  emitLog(payload: DeploymentLogPayload): void {
    this.appendToBuffer(payload);
    this.server
      .to(this.roomName(payload.deploymentId))
      .emit('deployment:log', payload);
  }

  @OnEvent(DEPLOYMENT_WS_STATUS)
  emitStatus(payload: DeploymentStatusPayload): void {
    this.server
      .to(this.roomName(payload.deploymentId))
      .emit('deployment:status', payload);
  }

  @OnEvent(DEPLOYMENT_WS_FINISHED)
  emitFinished(payload: DeploymentFinishedPayload): void {
    this.server
      .to(this.roomName(payload.deploymentId))
      .emit('deployment:finished', payload);
    // Buffer no longer needed once deployment ends — DB holds the full history.
    this.logBuffer.delete(payload.deploymentId);
  }

  @SubscribeMessage('deployment:request-replay')
  async handleReplayRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RequestReplayPayload,
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    const deploymentId = payload?.deploymentId?.trim();
    if (!deploymentId) {
      return { ok: false, error: 'deploymentId manquant' };
    }

    const user = (client.data as { user?: JwtPayload }).user;
    if (!user) {
      return { ok: false, error: 'Utilisateur non authentifié' };
    }

    // Re-check authorization to avoid sending replay to a client that
    // never joined / lost access between events.
    const hasAccess = await this.canAccessDeployment(user, deploymentId);
    if (!hasAccess) {
      return { ok: false, error: 'Accès non autorisé à ce déploiement' };
    }

    const buffer = this.logBuffer.get(deploymentId);
    if (!buffer || buffer.length === 0) {
      return { ok: true, count: 0 };
    }

    const replayPayload: DeploymentLogReplayPayload = {
      deploymentId,
      logs: buffer.slice(),
    };
    client.emit('deployment:log-replay', replayPayload);
    return { ok: true, count: buffer.length };
  }

  @SubscribeMessage('logs:subscribe')
  async handleLogsSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      deploymentId?: string;
      serverId?: string;
      containerName?: string;
      tail?: number;
    },
  ): Promise<{ ok: boolean; subscriptionKey?: string; error?: string }> {
    const deploymentId = payload?.deploymentId?.trim();
    const serverId = payload?.serverId?.trim();
    const containerName = payload?.containerName?.trim();
    if (!deploymentId || !serverId || !containerName) {
      return {
        ok: false,
        error: 'deploymentId, serverId et containerName sont requis',
      };
    }

    const user = (client.data as { user?: JwtPayload }).user;
    if (!user) {
      return { ok: false, error: 'Utilisateur non authentifié' };
    }
    const hasAccess = await this.canAccessDeployment(user, deploymentId);
    if (!hasAccess) {
      return { ok: false, error: 'Accès non autorisé à ce déploiement' };
    }

    try {
      const key = this.logStreamService.subscribe(client, {
        deploymentId,
        serverId,
        containerName,
        tail: payload.tail,
      });
      if (!key) {
        return {
          ok: false,
          error:
            'Streaming indisponible (DockerConnection non configurée ou container introuvable)',
        };
      }
      return { ok: true, subscriptionKey: key };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erreur inconnue';
      return { ok: false, error: message };
    }
  }

  @SubscribeMessage('logs:unsubscribe')
  handleLogsUnsubscribe(@MessageBody() payload: { subscriptionKey?: string }): {
    ok: boolean;
    cancelled?: boolean;
  } {
    const key = payload?.subscriptionKey;
    if (!key) return { ok: false };
    return { ok: true, cancelled: this.logStreamService.unsubscribe(key) };
  }

  private appendToBuffer(payload: DeploymentLogPayload): void {
    let buffer = this.logBuffer.get(payload.deploymentId);
    if (!buffer) {
      buffer = [];
      this.logBuffer.set(payload.deploymentId, buffer);
    }
    buffer.push(payload);
    if (buffer.length > this.MAX_BUFFER_SIZE) {
      buffer.shift();
    }
  }

  private roomName(deploymentId: string): string {
    return `deployment:${deploymentId}`;
  }

  private async canAccessDeployment(
    user: JwtPayload,
    deploymentId: string,
  ): Promise<boolean> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { projectId: true },
    });
    if (!deployment) {
      return false;
    }

    const member = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: deployment.projectId,
          userId: user.id,
        },
      },
      select: { id: true },
    });

    return Boolean(member);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import {
  extractTokenFromCookieHeader,
  AUTH_COOKIE_NAME_DEFAULT,
} from '../../common/auth/auth-cookie.util';

function resolveGatewayCorsOrigins(): string[] {
  const envOrigins = [process.env.FRONTEND_URLS, process.env.FRONTEND_URL]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (envOrigins.length > 0) {
    return Array.from(new Set(envOrigins));
  }

  return ['http://localhost:3000', 'http://localhost:3002'];
}

type DeploymentLogLevel = 'info' | 'error' | 'success';

type DeploymentStartedPayload = {
  deploymentId: string;
  projectId?: string;
  environmentId?: string;
  status?: string;
  startedAt?: Date | null;
  initiatorRole?: string;
};

type DeploymentLogPayload = {
  deploymentId: string;
  message: string;
  level: DeploymentLogLevel;
  timestamp: string;
};

type DeploymentStatusPayload = {
  deploymentId: string;
  status: string;
};

type DeploymentFinishedPayload = {
  deploymentId: string;
  status: string;
  finishedAt?: Date | null;
};

type JoinDeploymentPayload = {
  deploymentId?: string;
};

@Injectable()
@WebSocketGateway({
  namespace: '/deployments',
  cors: {
    origin: resolveGatewayCorsOrigins(),
    credentials: true,
  },
})
export class DeploymentsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(DeploymentsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // Vérifie le token JWT à chaque nouvelle connexion WebSocket.
  // Les clients sans token valide sont immédiatement déconnectés.
  handleConnection(client: Socket): void {
    const authData = client.handshake.auth as Record<string, unknown>;
    const cookieName = process.env.AUTH_COOKIE_NAME || AUTH_COOKIE_NAME_DEFAULT;
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

  emitStarted(payload: DeploymentStartedPayload): void {
    this.server
      .to(this.roomName(payload.deploymentId))
      .emit('deployment:started', payload);
  }

  emitLog(payload: DeploymentLogPayload): void {
    this.server
      .to(this.roomName(payload.deploymentId))
      .emit('deployment:log', payload);
  }

  emitStatus(payload: DeploymentStatusPayload): void {
    this.server
      .to(this.roomName(payload.deploymentId))
      .emit('deployment:status', payload);
  }

  emitFinished(payload: DeploymentFinishedPayload): void {
    this.server
      .to(this.roomName(payload.deploymentId))
      .emit('deployment:finished', payload);
  }

  private roomName(deploymentId: string): string {
    return `deployment:${deploymentId}`;
  }

  private async canAccessDeployment(
    user: JwtPayload,
    deploymentId: string,
  ): Promise<boolean> {
    if (user.role === Role.ADMIN) {
      return true;
    }

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

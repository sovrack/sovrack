import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

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

@Injectable()
@WebSocketGateway({
  namespace: '/deployments',
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000' },
})
export class DeploymentsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(DeploymentsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  // Vérifie le token JWT à chaque nouvelle connexion WebSocket.
  // Les clients sans token valide sont immédiatement déconnectés.
  handleConnection(client: Socket): void {
    const authData = client.handshake.auth as Record<string, unknown>;
    const rawToken =
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

  emitStarted(payload: DeploymentStartedPayload): void {
    this.server.emit('deployment:started', payload);
  }

  emitLog(payload: DeploymentLogPayload): void {
    this.server.emit('deployment:log', payload);
  }

  emitStatus(payload: DeploymentStatusPayload): void {
    this.server.emit('deployment:status', payload);
  }

  emitFinished(payload: DeploymentFinishedPayload): void {
    this.server.emit('deployment:finished', payload);
  }
}

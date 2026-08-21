import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ServerRunKind } from '@prisma/client';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import {
  AUTH_COOKIE_NAME_DEFAULT,
  extractTokenFromCookieHeader,
} from '../../../../shared/http/auth-cookie.util';
import { resolveGatewayCorsOrigins } from '../../../../shared/http/cors-origins.util';
import { WorkspaceAccessService } from '../../../iam/authorization/workspace-access.service';
import { WorkspaceActions } from '../../../iam/authorization/workspace-policy.types';

type JoinSetupPayload = {
  setupId?: string;
};

@Injectable()
@WebSocketGateway({
  namespace: '/server-setups',
  cors: {
    origin: resolveGatewayCorsOrigins(),
    credentials: true,
  },
})
export class ServerSetupGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ServerSetupGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

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
    const token =
      typeof rawToken === 'string'
        ? rawToken.replace(/^Bearer\s+/i, '').trim()
        : null;

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      (client.data as { user: JwtPayload }).user = payload;
    } catch {
      this.logger.warn(`Setup socket rejected (id: ${client.id})`);
      client.disconnect();
    }
  }

  @SubscribeMessage('join:setup')
  async handleJoinSetup(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinSetupPayload,
  ): Promise<{ ok: boolean; setupId?: string; error?: string }> {
    const setupId = payload?.setupId?.trim();
    if (!setupId) {
      return { ok: false, error: 'setupId manquant' };
    }

    const setupRun = await this.prisma.serverRun.findFirst({
      where: { id: setupId, kind: ServerRunKind.PREPARATION },
      select: { id: true, teamId: true },
    });
    if (!setupRun) {
      return { ok: false, setupId, error: 'Setup introuvable' };
    }
    const user = (client.data as { user?: JwtPayload }).user;
    if (!user) {
      return { ok: false, setupId, error: 'Utilisateur non authentifié' };
    }
    try {
      await this.workspaceAccess.assertWorkspaceAction(
        setupRun.teamId,
        user.id,
        WorkspaceActions.MANAGE_SERVER,
      );
    } catch {
      return { ok: false, setupId, error: 'Setup introuvable' };
    }

    await client.join(this.roomName(setupId));
    client.emit('setup:joined', { setupId });
    return { ok: true, setupId };
  }

  emitLog(payload: {
    setupId: string;
    level: string;
    source: string;
    message: string;
    lineNumber: number;
    createdAt: Date;
  }): void {
    this.server.to(this.roomName(payload.setupId)).emit('setup:log', {
      ...payload,
      createdAt: payload.createdAt.toISOString(),
    });
  }

  emitStatus(payload: { setupId: string; status: string }): void {
    this.server
      .to(this.roomName(payload.setupId))
      .emit('setup:status', payload);
  }

  emitFinished(payload: {
    setupId: string;
    status: string;
    summary?: string | null;
    errorMessage?: string | null;
  }): void {
    this.server
      .to(this.roomName(payload.setupId))
      .emit('setup:finished', payload);
  }

  private roomName(setupId: string): string {
    return `server-setup:${setupId}`;
  }
}

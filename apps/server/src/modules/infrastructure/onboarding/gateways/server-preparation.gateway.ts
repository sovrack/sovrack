import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, ServerRunKind } from '@prisma/client';
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

type JoinPreparationPayload = {
  preparationId?: string;
};

@Injectable()
@WebSocketGateway({
  namespace: '/server-preparations',
  cors: {
    origin: resolveGatewayCorsOrigins(),
    credentials: true,
  },
})
export class ServerPreparationGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ServerPreparationGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
      if (payload.role !== Role.ADMIN) {
        client.disconnect();
        return;
      }
      (client.data as { user: JwtPayload }).user = payload;
    } catch {
      this.logger.warn(`Preparation socket rejected (id: ${client.id})`);
      client.disconnect();
    }
  }

  @SubscribeMessage('join:preparation')
  async handleJoinPreparation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPreparationPayload,
  ): Promise<{ ok: boolean; preparationId?: string; error?: string }> {
    const preparationId = payload?.preparationId?.trim();
    if (!preparationId) {
      return { ok: false, error: 'preparationId manquant' };
    }

    const preparation = await this.prisma.serverRun.findFirst({
      where: { id: preparationId, kind: ServerRunKind.PREPARATION },
      select: { id: true },
    });
    if (!preparation) {
      return { ok: false, preparationId, error: 'Setup introuvable' };
    }

    await client.join(this.roomName(preparationId));
    client.emit('preparation:joined', { preparationId });
    return { ok: true, preparationId };
  }

  emitLog(payload: {
    preparationId: string;
    level: string;
    source: string;
    message: string;
    lineNumber: number;
    createdAt: Date;
  }): void {
    this.server
      .to(this.roomName(payload.preparationId))
      .emit('preparation:log', {
        ...payload,
        createdAt: payload.createdAt.toISOString(),
      });
  }

  emitStatus(payload: { preparationId: string; status: string }): void {
    this.server
      .to(this.roomName(payload.preparationId))
      .emit('preparation:status', payload);
  }

  emitFinished(payload: {
    preparationId: string;
    status: string;
    summary?: string | null;
    errorMessage?: string | null;
  }): void {
    this.server
      .to(this.roomName(payload.preparationId))
      .emit('preparation:finished', payload);
  }

  private roomName(preparationId: string): string {
    return `server-preparation:${preparationId}`;
  }
}

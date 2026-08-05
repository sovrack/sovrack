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
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import {
  AUTH_COOKIE_NAME_DEFAULT,
  extractTokenFromCookieHeader,
} from '../../shared/http/auth-cookie.util';
import { resolveGatewayCorsOrigins } from '../../shared/http/cors-origins.util';

type JoinRunPayload = {
  runId?: string;
};

@Injectable()
@WebSocketGateway({
  namespace: '/automation',
  cors: {
    origin: resolveGatewayCorsOrigins(),
    credentials: true,
  },
})
export class AutomationGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AutomationGateway.name);

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
      // Même autorisation que les routes REST GET (automation.controller.ts) :
      // un développeur peut consulter un run, il doit donc aussi pouvoir en
      // recevoir les mises à jour en direct, pas seulement l'état figé au
      // premier chargement.
      if (payload.role !== Role.OWNER && payload.role !== Role.MEMBER) {
        client.disconnect();
        return;
      }
      (client.data as { user: JwtPayload }).user = payload;
    } catch {
      this.logger.warn(`Automation socket rejected (id: ${client.id})`);
      client.disconnect();
    }
  }

  @SubscribeMessage('join:automation-run')
  async handleJoinRun(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRunPayload,
  ): Promise<{ ok: boolean; runId?: string; error?: string }> {
    const runId = payload?.runId?.trim();
    if (!runId) {
      return { ok: false, error: 'runId manquant' };
    }

    const run = await this.prisma.serverRun.findFirst({
      where: { id: runId, kind: ServerRunKind.AUTOMATION },
      select: { id: true },
    });
    if (!run) {
      return { ok: false, runId, error: 'Automation run introuvable' };
    }

    await client.join(this.roomName(runId));
    client.emit('automation:joined', { runId });
    return { ok: true, runId };
  }

  emitRunStatus(payload: { runId: string; status: string }): void {
    this.server
      .to(this.roomName(payload.runId))
      .emit('automation:status', payload);
  }

  emitRunLog(payload: {
    runId: string;
    serverId?: string | null;
    level: string;
    source: string;
    message: string;
    lineNumber: number;
    createdAt: Date;
  }): void {
    this.server.to(this.roomName(payload.runId)).emit('automation:log', {
      ...payload,
      createdAt: payload.createdAt.toISOString(),
    });
  }

  emitRunFinished(payload: {
    runId: string;
    status: string;
    summary?: string | null;
    errorMessage?: string | null;
  }): void {
    this.server
      .to(this.roomName(payload.runId))
      .emit('automation:finished', payload);
  }

  private roomName(runId: string): string {
    return `automation-run:${runId}`;
  }
}

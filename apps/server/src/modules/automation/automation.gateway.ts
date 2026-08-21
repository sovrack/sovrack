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
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import {
  AUTH_COOKIE_NAME_DEFAULT,
  extractTokenFromCookieHeader,
} from '../../shared/http/auth-cookie.util';
import { resolveGatewayCorsOrigins } from '../../shared/http/cors-origins.util';
import { WorkspaceAccessService } from '../iam/authorization/workspace-access.service';
import { WorkspaceActions } from '../iam/authorization/workspace-policy.types';

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
      select: { id: true, teamId: true },
    });
    if (!run) {
      return { ok: false, runId, error: 'Automation run introuvable' };
    }
    const user = (client.data as { user?: JwtPayload }).user;
    if (!user) {
      return { ok: false, runId, error: 'Utilisateur non authentifié' };
    }
    try {
      await this.workspaceAccess.assertWorkspaceAction(
        run.teamId,
        user.id,
        WorkspaceActions.MANAGE_SERVER,
      );
    } catch {
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

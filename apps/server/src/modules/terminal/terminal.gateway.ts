import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { Role } from '@prisma/client';
import {
  AUTH_COOKIE_NAME_DEFAULT,
  extractTokenFromCookieHeader,
} from '../../shared/http/auth-cookie.util';
import { resolveGatewayCorsOrigins } from '../../shared/http/cors-origins.util';
import { TerminalService } from './terminal.service';
import type { JwtPayloadDto } from '../../shared/jwt/dto/jwt-payload.dto';
import { JwtSessionValidator } from '../../shared/jwt/jwt-session-validator.service';

type SessionEntry = {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => void;
};

@WebSocketGateway({
  namespace: '/terminal',
  cors: {
    origin: resolveGatewayCorsOrigins(),
    credentials: true,
  },
})
export class TerminalGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly sessions = new Map<string, SessionEntry>();

  constructor(
    private readonly terminalService: TerminalService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionValidator: JwtSessionValidator,
  ) {}

  handleDisconnect(client: Socket) {
    this.closeSession(client.id);
  }

  @SubscribeMessage('terminal:connect')
  async handleConnect(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { serverId: string; token?: string; cols?: number; rows?: number },
  ) {
    try {
      const token = this.resolveToken(client, body.token);
      const actor = token ? await this.verifyToken(token) : null;
      if (!actor) {
        client.emit('terminal:error', 'Non autorisé');
        return;
      }

      this.closeSession(client.id);

      const cols = body.cols ?? 120;
      const rows = body.rows ?? 30;

      const session = await this.terminalService.openSession(
        body.serverId,
        actor.id,
        actor.role,
        { cols, rows },
        {
          onData: (data) => client.emit('terminal:data', data),
          onClose: (code) => {
            client.emit('terminal:close', { code });
            this.sessions.delete(client.id);
          },
          onError: (msg) => client.emit('terminal:error', msg),
        },
      );

      this.sessions.set(client.id, session);
      client.emit('terminal:ready');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erreur de connexion SSH';
      client.emit('terminal:error', message);
    }
  }

  @SubscribeMessage('terminal:data')
  handleData(@ConnectedSocket() client: Socket, @MessageBody() data: string) {
    this.sessions.get(client.id)?.write(data);
  }

  @SubscribeMessage('terminal:resize')
  handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { cols: number; rows: number },
  ) {
    this.sessions.get(client.id)?.resize(body.cols, body.rows);
  }

  @SubscribeMessage('terminal:disconnect')
  handleDisconnectRequest(@ConnectedSocket() client: Socket) {
    this.closeSession(client.id);
    client.emit('terminal:close', { code: null });
  }

  private closeSession(clientId: string) {
    const session = this.sessions.get(clientId);
    if (session) {
      session.close();
      this.sessions.delete(clientId);
    }
  }

  private async verifyToken(
    token: string,
  ): Promise<{ id: string; role: Role } | null> {
    try {
      const secret = this.configService.get<string>('JWT_SECRET') ?? '';
      const payload = this.jwtService.verify<JwtPayloadDto>(token, { secret });
      await this.sessionValidator.validate(payload);
      if (payload.authType === 'staff-impersonation') {
        throw new ForbiddenException(
          "Le terminal est indisponible dans une session d'assistance",
        );
      }
      return { id: payload.id, role: payload.role };
    } catch {
      return null;
    }
  }

  private resolveToken(client: Socket, tokenFromBody?: string): string | null {
    if (tokenFromBody?.trim()) {
      return tokenFromBody.trim();
    }

    const authData = client.handshake.auth as Record<string, unknown>;
    const authToken = authData.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const cookieName =
      this.configService.get<string>('AUTH_COOKIE_NAME')?.trim() ||
      AUTH_COOKIE_NAME_DEFAULT;
    const cookieToken = extractTokenFromCookieHeader(
      client.handshake.headers.cookie,
      cookieName,
    );
    if (cookieToken) {
      return cookieToken;
    }

    const authorization = client.handshake.headers.authorization;
    if (typeof authorization === 'string' && authorization.trim()) {
      return authorization.replace(/^Bearer\s+/i, '').trim();
    }

    return null;
  }
}

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { resolveGatewayCorsOrigins } from '../../../shared/http/cors-origins.util';
import {
  AgentTunnelService,
  type AgentHostInfo,
  type AgentSystemMetrics,
  type AgentCommandResult,
} from './agent-tunnel.service';

@WebSocketGateway({
  namespace: '/agent-tunnel',
  cors: {
    origin: resolveGatewayCorsOrigins(),
    credentials: true,
  },
})
export class AgentTunnelGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentTunnelGateway.name);

  constructor(private readonly agentTunnel: AgentTunnelService) {}

  async handleConnection(client: Socket) {
    const authHeader = client.handshake.headers.authorization;
    const token =
      (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null) ||
      (typeof client.handshake.query.token === 'string'
        ? client.handshake.query.token
        : null);

    if (!token) {
      this.logger.warn(
        `Agent connection rejected: no token provided (socket: ${client.id})`,
      );
      client.disconnect(true);
      return;
    }

    try {
      await this.agentTunnel.registerAgentConnection(client, token);
      client.emit('CONNECTED_ACK', { status: 'authenticated' });
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.agentTunnel.handleDisconnect(client.id);
  }

  @SubscribeMessage('AGENT_PING')
  handlePing(@ConnectedSocket() client: Socket) {
    this.agentTunnel.handlePing(client.id);
    client.emit('AGENT_PONG', { timestamp: Date.now() });
  }

  @SubscribeMessage('AGENT_HELLO')
  handleHello(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { host?: AgentHostInfo },
  ) {
    if (payload?.host) {
      this.agentTunnel.handleHello(client.id, payload.host);
    }
  }

  @SubscribeMessage('METRICS_UPDATE')
  handleMetrics(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Record<string, unknown>,
  ) {
    if (payload) {
      this.agentTunnel.handleMetrics(
        client.id,
        payload as unknown as AgentSystemMetrics,
      );
    }
  }

  @SubscribeMessage('COMMAND_RESULT')
  handleCommandResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Record<string, unknown>,
  ) {
    const result = payload as unknown as AgentCommandResult;
    if (result?.id) {
      this.agentTunnel.handleCommandResult(client.id, result);
    }
  }
}

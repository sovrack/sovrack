import { Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { DockerApiService } from '../../../core/container-runtime/docker-api.service';
import { ContainersService } from '../containers.service';

type LogStreamPayload = {
  containerId: string;
  tail?: number;
};

@WebSocketGateway({ namespace: '/containers', cors: { origin: '*' } })
export class ContainersGateway implements OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ContainersGateway.name);
  private readonly activeStreams = new Map<string, AbortController>();

  constructor(
    private readonly containersService: ContainersService,
    private readonly docker: DockerApiService,
  ) {}

  handleDisconnect(client: Socket): void {
    this.stopStream(client.id);
  }

  @SubscribeMessage('container:logs:start')
  async handleLogsStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LogStreamPayload,
  ): Promise<void> {
    this.stopStream(client.id);

    const container = await this.containersService.findOne(payload.containerId).catch(() => null);
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
          { follow: true, tail: payload.tail ?? 100 },
        );
        for await (const entry of stream) {
          if (controller.signal.aborted) break;
          client.emit('container:log', entry);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const message = err instanceof Error ? err.message : 'Erreur log stream';
          this.logger.error(`Log stream error for container ${payload.containerId}: ${message}`);
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

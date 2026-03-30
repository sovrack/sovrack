import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@Injectable()
@WebSocketGateway({
  namespace: '/deployments',
  cors: { origin: '*' },
})
export class DeploymentsGateway {
  @WebSocketServer()
  server!: Server;

  emitStarted(payload: Record<string, unknown>): void {
    this.server.emit('deployment:started', payload);
  }

  emitLog(payload: { message: string; timestamp: string }): void {
    this.server.emit('deployment:log', payload);
  }

  emitStatus(payload: { deploymentId: string; status: string }): void {
    this.server.emit('deployment:status', payload);
  }

  emitFinished(payload: Record<string, unknown>): void {
    this.server.emit('deployment:finished', payload);
  }
}

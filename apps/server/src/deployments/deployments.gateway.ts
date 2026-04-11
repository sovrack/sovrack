import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

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
export class DeploymentsGateway {
  @WebSocketServer()
  server!: Server;

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

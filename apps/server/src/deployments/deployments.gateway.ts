import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

function resolveSocketOrigins(): string[] {
  const envOrigins = [
    process.env.FRONTEND_URLS,
    process.env.FRONTEND_URL,
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (envOrigins.length > 0) {
    return Array.from(new Set(envOrigins));
  }

  return ['http://localhost:3000', 'http://localhost:3002'];
}

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
  cors: { origin: resolveSocketOrigins() },
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

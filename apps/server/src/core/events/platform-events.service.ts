import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

// ─── Event names ─────────────────────────────────────────────────────────────

export const PLATFORM_EVENTS = {
  DEPLOYMENT_STARTED: 'deployment.started',
  DEPLOYMENT_FINISHED: 'deployment.finished',
  DEPLOYMENT_FAILED: 'deployment.failed',
  BUILD_STARTED: 'build.started',
  BUILD_FINISHED: 'build.finished',
  BUILD_FAILED: 'build.failed',
  SERVER_ONLINE: 'server.online',
  SERVER_OFFLINE: 'server.offline',
  INFRA_PREPARATION_STARTED: 'infra.preparation.started',
  INFRA_PREPARATION_FINISHED: 'infra.preparation.finished',
  INFRA_PREPARATION_FAILED: 'infra.preparation.failed',
} as const;

export type PlatformEventName = typeof PLATFORM_EVENTS[keyof typeof PLATFORM_EVENTS];

// ─── Event payloads ───────────────────────────────────────────────────────────

export type DeploymentStartedEvent = { deploymentId: string; projectId: string; environmentId: string };
export type DeploymentFinishedEvent = { deploymentId: string; projectId: string; status: string };
export type DeploymentFailedEvent = { deploymentId: string; projectId: string; error: string };
export type BuildStartedEvent = { buildId: string; projectId: string; buildPack: string };
export type BuildFinishedEvent = { buildId: string; projectId: string; imageSha?: string };
export type BuildFailedEvent = { buildId: string; projectId: string; error: string };
export type ServerOnlineEvent = { serverId: string };
export type ServerOfflineEvent = { serverId: string; reason?: string };
export type InfraPreparationStartedEvent = { serverId: string; preparationId: string };
export type InfraPreparationFinishedEvent = { serverId: string; preparationId: string };
export type InfraPreparationFailedEvent = { serverId: string; preparationId: string; error: string };

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class PlatformEventsService {
  constructor(private readonly emitter: EventEmitter2) {}

  emit<T>(event: PlatformEventName, payload: T): void {
    this.emitter.emit(event, payload);
  }

  on<T>(event: PlatformEventName, handler: (payload: T) => void): void {
    this.emitter.on(event, handler);
  }

  // ─── Typed helpers ────────────────────────────────────────────────────────

  emitDeploymentStarted(payload: DeploymentStartedEvent): void {
    this.emit(PLATFORM_EVENTS.DEPLOYMENT_STARTED, payload);
  }

  emitDeploymentFinished(payload: DeploymentFinishedEvent): void {
    this.emit(PLATFORM_EVENTS.DEPLOYMENT_FINISHED, payload);
  }

  emitDeploymentFailed(payload: DeploymentFailedEvent): void {
    this.emit(PLATFORM_EVENTS.DEPLOYMENT_FAILED, payload);
  }

  emitBuildStarted(payload: BuildStartedEvent): void {
    this.emit(PLATFORM_EVENTS.BUILD_STARTED, payload);
  }

  emitBuildFinished(payload: BuildFinishedEvent): void {
    this.emit(PLATFORM_EVENTS.BUILD_FINISHED, payload);
  }

  emitBuildFailed(payload: BuildFailedEvent): void {
    this.emit(PLATFORM_EVENTS.BUILD_FAILED, payload);
  }

  emitServerOnline(payload: ServerOnlineEvent): void {
    this.emit(PLATFORM_EVENTS.SERVER_ONLINE, payload);
  }

  emitServerOffline(payload: ServerOfflineEvent): void {
    this.emit(PLATFORM_EVENTS.SERVER_OFFLINE, payload);
  }

  emitInfraPreparationStarted(payload: InfraPreparationStartedEvent): void {
    this.emit(PLATFORM_EVENTS.INFRA_PREPARATION_STARTED, payload);
  }

  emitInfraPreparationFinished(payload: InfraPreparationFinishedEvent): void {
    this.emit(PLATFORM_EVENTS.INFRA_PREPARATION_FINISHED, payload);
  }

  emitInfraPreparationFailed(payload: InfraPreparationFailedEvent): void {
    this.emit(PLATFORM_EVENTS.INFRA_PREPARATION_FAILED, payload);
  }
}

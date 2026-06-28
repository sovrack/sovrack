import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DEPLOYMENT_WS_STARTED,
  DEPLOYMENT_WS_LOG,
  DEPLOYMENT_WS_STATUS,
  DEPLOYMENT_WS_FINISHED,
  type DeploymentStartedPayload,
  type DeploymentLogPayload,
  type DeploymentStatusPayload,
  type DeploymentFinishedPayload,
} from './deployment-ws.events';

/**
 * Façade typée pour publier la progression d'un déploiement.
 *
 * Injectée par le cœur (core/, triggers/, health/) à la place de l'ancien
 * couplage direct au DeploymentsGateway. Le gateway écoute ces événements
 * (@OnEvent) et les pousse au client WebSocket. Garde les mêmes noms de
 * méthodes que l'ancien gateway → les appels du cœur restent inchangés, mais
 * la dépendance core/ → gateways/ disparaît (le cœur ne dépend plus que de
 * events/, une couche neutre plus basse).
 */
@Injectable()
export class DeploymentEventsPublisher {
  constructor(private readonly events: EventEmitter2) {}

  emitStarted(payload: DeploymentStartedPayload): void {
    this.events.emit(DEPLOYMENT_WS_STARTED, payload);
  }

  emitLog(payload: DeploymentLogPayload): void {
    this.events.emit(DEPLOYMENT_WS_LOG, payload);
  }

  emitStatus(payload: DeploymentStatusPayload): void {
    this.events.emit(DEPLOYMENT_WS_STATUS, payload);
  }

  emitFinished(payload: DeploymentFinishedPayload): void {
    this.events.emit(DEPLOYMENT_WS_FINISHED, payload);
  }
}

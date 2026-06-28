import { Injectable } from '@nestjs/common';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import type { DeploymentLogLevel } from '../events/deployment-ws.events';

/**
 * Émet les lignes de log d'un déploiement vers le flux WebSocket (via le
 * publisher d'événements), en découpant les messages multi-lignes et en
 * inférant le niveau (info/error/success) à partir du contenu.
 *
 * Extrait de DockerDeployExecutorService pour être partagé par les services
 * du cœur de déploiement (orchestrateur, résolution d'image, etc.) sans
 * dupliquer la logique de formatage.
 */
@Injectable()
export class DeploymentLogEmitter {
  constructor(private readonly events: DeploymentEventsPublisher) {}

  emit(
    deploymentId: string,
    rawMessage: string,
    fallbackLevel: 'info' | 'error',
  ): void {
    const lines = rawMessage
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const line of lines) {
      this.events.emitLog({
        deploymentId,
        message: line,
        level: this.inferLevel(line, fallbackLevel),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private inferLevel(
    message: string,
    fallbackLevel: 'info' | 'error',
  ): DeploymentLogLevel {
    if (/error|fail|fatal|exception/i.test(message)) return 'error';
    if (/success|ok|done|completed|ready/i.test(message)) return 'success';
    return fallbackLevel;
  }
}

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DeploymentStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { IDockerRuntime } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { ContainerLifecycleService } from './container-lifecycle.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  conditionsToJson,
  dockerDeployFailedCondition,
} from '../utils/deployment-conditions.util';

/** Params for the failure handler, extracted from DockerDeployExecutorService. */
export interface FailureHandlerParams {
  serverId: string;
  deploymentId: string;
  priorLogs: string | null;
  commandLogs: string;
  newContainerIds: string[];
  stoppedOld: Array<{ id: string; name: string }>;
  projectName: string;
  environmentName: string;
  branch: string;
  triggeredBy: string;
  error: unknown;
}

/**
 * Récupération automatique après échec de déploiement Docker : supprime les
 * conteneurs à moitié déployés, redémarre les anciens, marque le déploiement
 * FAILED et émet les événements WebSocket + notification. Extrait de
 * DockerDeployExecutorService — voir EXPLORATION_BACKEND_DEPENDANCES.md
 * section 3.
 */
@Injectable()
export class DeployFailureRecoveryService {
  constructor(
    @Inject(DOCKER_RUNTIME) private readonly docker: IDockerRuntime,
    private readonly containerLifecycle: ContainerLifecycleService,
    private readonly prisma: PrismaService,
    private readonly gateway: DeploymentEventsPublisher,
    private readonly notifications: NotificationsService,
  ) {}

  async handleDeployFailure(p: FailureHandlerParams): Promise<never> {
    for (const cid of p.newContainerIds) {
      await this.docker
        .removeContainer(p.serverId, cid, true)
        .catch(() => undefined);
    }
    let recoveryLogs = '';
    if (p.stoppedOld.length > 0) {
      recoveryLogs = await this.containerLifecycle
        .restartContainers(p.serverId, p.stoppedOld, p.deploymentId)
        .catch(() => '');
    }

    const message =
      p.error instanceof Error
        ? p.error.message
        : 'Échec du déploiement Docker';

    const failed = await this.prisma.deployment.update({
      where: { id: p.deploymentId },
      data: {
        status: DeploymentStatus.FAILED,
        conditions: conditionsToJson(dockerDeployFailedCondition(message)),
        finishedAt: new Date(),
        logs: `${p.priorLogs ?? ''}\n${p.commandLogs}${recoveryLogs}\n${message}`.trim(),
      },
    });

    this.gateway.emitStatus({ deploymentId: failed.id, status: failed.status });
    this.gateway.emitFinished({
      deploymentId: failed.id,
      status: failed.status,
      finishedAt: failed.finishedAt,
    });

    void this.notifications
      .notifyDeploymentFinished({
        deploymentId: failed.id,
        status: 'FAILED',
        projectName: p.projectName,
        environmentName: p.environmentName,
        branch: p.branch,
        triggeredBy: p.triggeredBy,
      })
      .catch(() => undefined);

    if (p.error instanceof BadRequestException) throw p.error;
    throw new BadRequestException('Déploiement Docker échoué');
  }
}

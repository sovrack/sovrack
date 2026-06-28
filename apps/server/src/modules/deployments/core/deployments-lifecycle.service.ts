import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ContainerStatus,
  Deployment,
  DeploymentStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { AuditService } from '../../audit/audit.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { DeploymentsAuthorizationService } from '../query/deployments-authorization.service';
import { DeploymentsQueryService } from '../query/deployments-query.service';

@Injectable()
export class DeploymentsLifecycleService {
  private readonly logger = new Logger(DeploymentsLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerApiService,
    private readonly gateway: DeploymentEventsPublisher,
    private readonly authorizationService: DeploymentsAuthorizationService,
    private readonly queryService: DeploymentsQueryService,
    private readonly auditService: AuditService,
  ) {}

  async recoverInFlightDeploymentsAfterRestart(): Promise<number> {
    const { count } = await this.prisma.deployment.updateMany({
      where: {
        status: {
          in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING],
        },
      },
      data: {
        status: DeploymentStatus.FAILED,
        finishedAt: new Date(),
        logs: 'Déploiement interrompu suite à un redémarrage backend. Relancez le déploiement.',
      },
    });

    if (count > 0) {
      this.logger.warn(
        `Recovery startup: ${count} déploiement(s) in-flight marqués FAILED après redémarrage.`,
      );
    }

    return count;
  }

  async cancel(
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<Deployment> {
    const deployment = await this.queryService.findOne(id, userId, userRole);
    await this.authorizationService.assertCanDeployProject(
      deployment.projectId,
      userId,
      userRole,
    );

    if (
      deployment.status !== DeploymentStatus.PENDING &&
      deployment.status !== DeploymentStatus.RUNNING
    ) {
      throw new BadRequestException(
        'Annulation possible uniquement pour un déploiement PENDING ou RUNNING',
      );
    }

    // Stop real Docker containers before updating DB status so the actual
    // container state matches what is recorded. Errors are logged but do not
    // prevent the DB update from completing.
    const runningContainers = await this.prisma.container.findMany({
      where: {
        deploymentId: id,
        status: { in: [ContainerStatus.RUNNING, ContainerStatus.CREATED] },
      },
      select: { id: true, dockerId: true, serverId: true },
    });
    for (const c of runningContainers) {
      await this.docker
        .stopContainer(c.serverId, c.dockerId)
        .catch((err: unknown) => {
          this.logger.warn(
            `Cancel: could not stop container ${c.dockerId}: ${err instanceof Error ? err.message : 'unknown'}`,
          );
        });
    }

    const canceled = await this.prisma.deployment.update({
      where: { id },
      data: {
        status: DeploymentStatus.CANCELED,
        finishedAt: new Date(),
        logs: `${deployment.logs ?? ''}\nDéploiement annulé par l'utilisateur`.trim(),
      },
    });

    await this.prisma.container.updateMany({
      where: { deploymentId: id },
      data: { status: ContainerStatus.EXITED },
    });

    this.gateway.emitStatus({
      deploymentId: canceled.id,
      status: canceled.status,
    });

    await this.auditService.record(
      userId,
      'DEPLOYMENT_CANCEL',
      'Deployment',
      canceled.id,
      {
        projectId: canceled.projectId,
        environmentId: canceled.environmentId,
      },
    );

    return canceled;
  }

  async remove(id: string, userId: string, userRole: Role): Promise<void> {
    const deployment = await this.queryService.findOne(id, userId, userRole);
    await this.authorizationService.assertCanDeployProject(
      deployment.projectId,
      userId,
      userRole,
    );

    // Stop real Docker containers before deleting the DB record.
    const runningContainersForDelete = await this.prisma.container.findMany({
      where: {
        deploymentId: id,
        status: { in: [ContainerStatus.RUNNING, ContainerStatus.CREATED] },
      },
      select: { id: true, dockerId: true, serverId: true },
    });
    for (const c of runningContainersForDelete) {
      await this.docker
        .stopContainer(c.serverId, c.dockerId)
        .catch((err: unknown) => {
          this.logger.warn(
            `Remove: could not stop container ${c.dockerId}: ${err instanceof Error ? err.message : 'unknown'}`,
          );
        });
    }

    await this.prisma.container.updateMany({
      where: { deploymentId: id },
      data: { status: ContainerStatus.EXITED },
    });

    await this.prisma.deployment.delete({ where: { id } });

    this.gateway.emitStatus({
      deploymentId: id,
      status: DeploymentStatus.CANCELED,
    });

    await this.auditService.record(
      userId,
      'DEPLOYMENT_DELETE',
      'Deployment',
      id,
      {
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
      },
    );

    this.logger.log(`Deployment ${id} deleted by user ${userId}`);
  }
}

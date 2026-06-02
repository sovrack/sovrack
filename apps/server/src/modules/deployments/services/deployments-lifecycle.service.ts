import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Deployment, DeploymentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { DeploymentsQueryService } from './deployments-query.service';

@Injectable()
export class DeploymentsLifecycleService {
  private readonly logger = new Logger(DeploymentsLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: DeploymentsGateway,
    private readonly authorizationService: DeploymentsAuthorizationService,
    private readonly queryService: DeploymentsQueryService,
  ) {}

  async recoverInFlightDeploymentsAfterRestart(): Promise<number> {
    const inFlight = await this.prisma.deployment.findMany({
      where: {
        status: {
          in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING],
        },
      },
      select: {
        id: true,
        status: true,
        logs: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (inFlight.length === 0) {
      return 0;
    }

    let recoveredCount = 0;
    for (const deployment of inFlight) {
      const updated = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\nDéploiement interrompu suite à un redémarrage backend. Relancez le déploiement.`.trim(),
        },
        select: {
          id: true,
          status: true,
          finishedAt: true,
        },
      });

      this.gateway.emitStatus({
        deploymentId: updated.id,
        status: updated.status,
      });
      this.gateway.emitFinished({
        deploymentId: updated.id,
        status: updated.status,
        finishedAt: updated.finishedAt,
      });

      recoveredCount += 1;
    }

    this.logger.warn(
      `Recovery startup: ${String(recoveredCount)} déploiement(s) in-flight marqués FAILED après redémarrage.`,
    );

    return recoveredCount;
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

    const canceled = await this.prisma.deployment.update({
      where: { id },
      data: {
        status: DeploymentStatus.CANCELED,
        finishedAt: new Date(),
        logs: `${deployment.logs ?? ''}\nDéploiement annulé par l'utilisateur`.trim(),
      },
    });

    this.gateway.emitStatus({
      deploymentId: canceled.id,
      status: canceled.status,
    });

    await this.recordAuditLog(userId, 'DEPLOYMENT_CANCEL', canceled.id, {
      projectId: canceled.projectId,
      environmentId: canceled.environmentId,
    });

    return canceled;
  }

  private async recordAuditLog(
    userId: string,
    action: string,
    resourceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          resourceType: 'Deployment',
          resourceId,
          ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Audit log ignoré (${action}) : ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      );
    }
  }
}

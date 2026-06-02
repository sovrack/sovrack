import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Deployment, DeploymentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { DeploymentsQueryService } from './deployments-query.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsAnsibleService } from './deployments-ansible.service';

@Injectable()
export class DeploymentsRollbackService {
  private readonly logger = new Logger(DeploymentsRollbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: DeploymentsAuthorizationService,
    private readonly queryService: DeploymentsQueryService,
    private readonly gateway: DeploymentsGateway,
    private readonly ansibleService: DeploymentsAnsibleService,
  ) {}

  async rollback(
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<Deployment> {
    const deployment = await this.queryService.findOne(id, userId, userRole);
    await this.authorizationService.assertCanRollbackProject(
      deployment.projectId,
      userId,
      userRole,
    );

    const previousSuccess = await this.prisma.deployment.findFirst({
      where: {
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        status: DeploymentStatus.SUCCESS,
        id: {
          not: deployment.id,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!previousSuccess) {
      throw new BadRequestException(
        'Aucun déploiement SUCCESS précédent trouvé',
      );
    }

    if (!previousSuccess.dockerImage) {
      throw new BadRequestException('Image de rollback introuvable');
    }

    const actor = await this.authorizationService.getActor(userId);

    const rollbackDeployment = await this.prisma.deployment.create({
      data: {
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        userId,
        branch: previousSuccess.branch,
        status: DeploymentStatus.RUNNING,
        dockerImage: previousSuccess.dockerImage,
        previousDeploymentId: previousSuccess.id,
        startedAt: new Date(),
        logs: `Rollback depuis ${previousSuccess.id}`,
      },
    });

    await this.recordAuditLog(
      userId,
      'DEPLOYMENT_ROLLBACK',
      rollbackDeployment.id,
      {
        projectId: rollbackDeployment.projectId,
        environmentId: rollbackDeployment.environmentId,
        sourceDeploymentId: previousSuccess.id,
      },
    );

    this.gateway.emitStarted({
      deploymentId: rollbackDeployment.id,
      projectId: rollbackDeployment.projectId,
      environmentId: rollbackDeployment.environmentId,
      status: rollbackDeployment.status,
      startedAt: rollbackDeployment.startedAt,
      initiatorRole: actor.role,
    });

    return await this.ansibleService.deployWithAnsible(
      rollbackDeployment.id,
      previousSuccess.dockerImage,
    );
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

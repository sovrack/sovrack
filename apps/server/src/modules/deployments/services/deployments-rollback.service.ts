import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Deployment, DeploymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { DeploymentsQueryService } from './deployments-query.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsExecutorService } from './deployments-executor.service';

@Injectable()
export class DeploymentsRollbackService {
  private readonly logger = new Logger(DeploymentsRollbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: DeploymentsAuthorizationService,
    private readonly queryService: DeploymentsQueryService,
    private readonly gateway: DeploymentsGateway,
    private readonly ansibleService: DeploymentsExecutorService,
    private readonly auditService: AuditService,
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

    // Prefer imageSha (immutable digest) over dockerImage (mutable tag).
    // If the original deploy used a `:latest` tag, the tag may now point to
    // a different image, so pinning to the recorded digest is the only way
    // to guarantee we redeploy the exact same content. The mutable tag is
    // still persisted on the new record for human readability.
    const rollbackImageRef =
      previousSuccess.imageSha ?? previousSuccess.dockerImage;

    const rollbackDeployment = await this.prisma.deployment.create({
      data: {
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        userId,
        branch: previousSuccess.branch,
        status: DeploymentStatus.RUNNING,
        dockerImage: previousSuccess.dockerImage,
        imageSha: previousSuccess.imageSha,
        isRollback: true,
        rolledBackAt: new Date(),
        previousDeploymentId: previousSuccess.id,
        startedAt: new Date(),
        logs: `Rollback depuis ${previousSuccess.id}` +
          (previousSuccess.imageSha
            ? ` (pinned to sha ${previousSuccess.imageSha})`
            : ''),
      },
    });

    await this.auditService.record(
      userId,
      'DEPLOYMENT_ROLLBACK',
      'Deployment',
      rollbackDeployment.id,
      {
        projectId: rollbackDeployment.projectId,
        environmentId: rollbackDeployment.environmentId,
        sourceDeploymentId: previousSuccess.id,
        usedDigest: previousSuccess.imageSha ?? null,
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
      rollbackImageRef,
    );
  }

}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Deployment, DeploymentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { DeploymentsAuthorizationService } from '../query/deployments-authorization.service';
import { DeploymentsQueryService } from '../query/deployments-query.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { DockerDeployExecutorService } from './docker-deploy-executor.service';
import { DeploymentPreflightService } from './deployment-preflight.service';

@Injectable()
export class DeploymentsRollbackService {
  private readonly logger = new Logger(DeploymentsRollbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: DeploymentsAuthorizationService,
    private readonly queryService: DeploymentsQueryService,
    private readonly gateway: DeploymentEventsPublisher,
    private readonly deployExecutor: DockerDeployExecutorService,
    private readonly auditService: AuditService,
    private readonly preflight: DeploymentPreflightService,
  ) {}

  async rollback(
    id: string,
    userId: string,
    userRole: Role,
    targetDeploymentId?: string,
  ): Promise<Deployment> {
    const deployment = await this.queryService.findOne(id, userId, userRole);
    await this.authorizationService.assertCanRollbackProject(
      deployment.projectId,
      userId,
      userRole,
    );

    // Source to restore: a SPECIFIC past deployment if targetDeploymentId is
    // given (rollback to ANY version), otherwise the most recent OTHER success
    // of the same service-env (rollback to previous). Both are scoped to the
    // same project + service-env so we never restore another service's image.
    const previousSuccess = targetDeploymentId
      ? await this.prisma.deployment.findFirst({
          where: {
            id: targetDeploymentId,
            projectId: deployment.projectId,
            ...(deployment.serviceId
              ? { serviceId: deployment.serviceId }
              : {}),
            ...(deployment.serviceEnvId
              ? { serviceEnvId: deployment.serviceEnvId }
              : {}),
            status: DeploymentStatus.SUCCESS,
          },
        })
      : await this.prisma.deployment.findFirst({
          where: {
            projectId: deployment.projectId,
            environmentId: deployment.environmentId,
            ...(deployment.serviceId
              ? { serviceId: deployment.serviceId }
              : {}),
            ...(deployment.serviceEnvId
              ? { serviceEnvId: deployment.serviceEnvId }
              : {}),
            status: DeploymentStatus.SUCCESS,
            id: { not: deployment.id },
          },
          orderBy: { createdAt: 'desc' },
        });

    if (!previousSuccess) {
      throw new BadRequestException(
        targetDeploymentId
          ? 'Déploiement cible introuvable ou non réussi pour ce service.'
          : 'Aucun déploiement SUCCESS précédent trouvé',
      );
    }

    if (!previousSuccess.dockerImage) {
      throw new BadRequestException('Image de rollback introuvable');
    }

    if (previousSuccess.specSnapshot == null) {
      this.logger.warn(
        `[Rollback] Deployment ${previousSuccess.id} has no specSnapshot — runtime config will fall back to current live service config instead of the frozen config at deploy time.`,
      );
    }

    // Minimal server guard (C1) — before relaunching an already-known-working
    // image, make sure the target server is still active/verified/prepared
    // and its Docker circuit breaker is closed. Not the full preflight (no
    // Dockerfile/secrets checks — meaningless for redeploying a frozen image).
    await this.preflight.assertServerReady(
      await this.resolveTargetServerId(previousSuccess),
    );

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
        strategy: previousSuccess.strategy,
        serviceId: previousSuccess.serviceId,
        serviceEnvId: previousSuccess.serviceEnvId,
        buildId: previousSuccess.buildId,
        dockerImage: previousSuccess.dockerImage,
        imageSha: previousSuccess.imageSha,
        isRollback: true,
        rolledBackAt: new Date(),
        previousDeploymentId: previousSuccess.id,
        startedAt: new Date(),
        specSnapshot: (previousSuccess.specSnapshot ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        observedGeneration: previousSuccess.observedGeneration,
        logs:
          `Rollback depuis ${previousSuccess.id}` +
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

    return await this.deployExecutor.executeDeploy(
      rollbackDeployment.id,
      rollbackImageRef,
    );
  }

  /**
   * Resolve the server a past deployment ran on. Prefers `resolvedRefs`
   * (frozen at deploy time — same field ReconcilerService reads for
   * auto-heal), falling back to the live serviceEnvironment/environment
   * binding for older rows created before resolvedRefs existed.
   */
  private async resolveTargetServerId(deployment: Deployment): Promise<string> {
    const fromSnapshot = (
      deployment.resolvedRefs as { serverId?: string } | null
    )?.serverId;
    if (fromSnapshot) return fromSnapshot;

    if (deployment.serviceEnvId) {
      const serviceEnv = await this.prisma.serviceEnvironment.findUnique({
        where: { id: deployment.serviceEnvId },
        select: {
          server: { select: { id: true } },
          environment: { select: { servers: { select: { id: true } } } },
        },
      });
      const serverId =
        serviceEnv?.server?.id ?? serviceEnv?.environment.servers[0]?.id;
      if (serverId) return serverId;
    }

    throw new BadRequestException(
      'Impossible de déterminer le serveur cible de ce déploiement (aucun serveur résolu).',
    );
  }
}

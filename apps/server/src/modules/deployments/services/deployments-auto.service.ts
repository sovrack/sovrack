import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DeploymentStatus } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  DEPLOYMENT_PIPELINE_UPDATED,
  type AutoDeployTriggerEvent,
  type PipelineUpdatedEvent,
} from '../events/deployment.events';
import { DeploymentsAnsibleService } from './deployments-ansible.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  deploymentRelationsInclude,
  type DeploymentWithRelations,
} from './deployments-query.service';

@Injectable()
export class DeploymentsAutoService {
  private readonly logger = new Logger(DeploymentsAutoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ansibleService: DeploymentsAnsibleService,
    private readonly gateway: DeploymentsGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  @OnEvent(DEPLOYMENT_PIPELINE_UPDATED)
  async onPipelineUpdated(event: PipelineUpdatedEvent): Promise<void> {
    await this.handleWebhookUpdate(
      event.pipelineId,
      event.webhookStatus,
      event.image,
    );
  }

  @OnEvent(DEPLOYMENT_AUTO_DEPLOY_TRIGGER)
  async onAutoDeployTrigger(event: AutoDeployTriggerEvent): Promise<void> {
    await this.triggerAutoDeployIfConfigured(
      event.projectId,
      event.branch,
      event.dockerImage,
      event.pipelineId,
      event.serviceId,
    );
  }

  async handleWebhookUpdate(
    pipelineId: number,
    status: string,
    image?: string,
  ): Promise<{ status: 'ok' | 'ignored' }> {
    const marker = this.buildPipelineMarker(pipelineId);
    const pipelineIdValue = this.toPipelineIdValue(pipelineId);

    const deployment = await this.prisma.deployment.findFirst({
      where: {
        status: {
          in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING],
        },
        OR: [
          {
            gitlabPipelineId: pipelineIdValue,
          },
          {
            logs: {
              contains: marker,
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!deployment) {
      return { status: 'ignored' };
    }

    const mappedStatus = this.mapDeploymentStatus(status);

    if (mappedStatus === DeploymentStatus.SUCCESS) {
      const successClaimMarker =
        this.buildWebhookSuccessClaimMarker(pipelineId);
      const claim = await this.prisma.deployment.updateMany({
        where: {
          id: deployment.id,
          status: {
            in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING],
          },
          NOT: {
            logs: {
              contains: successClaimMarker,
            },
          },
        },
        data: {
          status: DeploymentStatus.RUNNING,
          gitlabPipelineId: pipelineIdValue,
          logs: `${deployment.logs ?? ''}\nPipeline GitLab: ${status}\n${successClaimMarker}`.trim(),
        },
      });

      if (claim.count === 0) {
        return { status: 'ignored' };
      }

      await this.ansibleService.deployWithAnsible(deployment.id, image);
      return { status: 'ok' };
    }

    if (
      mappedStatus === DeploymentStatus.FAILED ||
      mappedStatus === DeploymentStatus.CANCELED
    ) {
      const finalizationMarker = this.buildWebhookFinalizationMarker(
        pipelineId,
        mappedStatus,
      );
      const finalized = await this.prisma.deployment.updateMany({
        where: {
          id: deployment.id,
          status: {
            in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING],
          },
          NOT: {
            logs: {
              contains: finalizationMarker,
            },
          },
        },
        data: {
          status: mappedStatus,
          finishedAt: new Date(),
          gitlabPipelineId: pipelineIdValue,
          logs: `${deployment.logs ?? ''}\nPipeline GitLab: ${status}\n${finalizationMarker}`.trim(),
        },
      });

      if (finalized.count === 0) {
        return { status: 'ignored' };
      }

      const updated = await this.prisma.deployment.findUnique({
        where: { id: deployment.id },
        select: {
          id: true,
          status: true,
          finishedAt: true,
        },
      });

      if (!updated) {
        return { status: 'ignored' };
      }

      this.gateway.emitStatus({
        deploymentId: updated.id,
        status: updated.status,
      });

      this.gateway.emitFinished({
        deploymentId: updated.id,
        status: updated.status,
        finishedAt: updated.finishedAt,
      });

      if (
        updated.status === DeploymentStatus.SUCCESS ||
        updated.status === DeploymentStatus.FAILED ||
        updated.status === DeploymentStatus.CANCELED
      ) {
        const full = await this.prisma.deployment.findUnique({
          where: { id: updated.id },
          include: deploymentRelationsInclude,
        });
        if (full) {
          this.sendDeploymentNotification(full);
        }
      }
    }

    return { status: 'ok' };
  }

  async triggerAutoDeployIfConfigured(
    projectId: string,
    branch: string,
    dockerImage?: string,
    pipelineId?: number,
    serviceId?: string,
  ): Promise<void> {
    const environments = await this.prisma.environment.findMany({
      where: {
        projectId,
        autoDeploy: true,
        OR: [
          { autoDeployBranch: branch },
          { autoDeployBranch: '*' },
          { autoDeployBranch: null },
        ],
        isActive: true,
        ...(serviceId
          ? {
              serviceTargets: {
                some: {
                  serviceId,
                  server: { isVerified: true },
                },
              },
            }
          : { server: { isVerified: true } }),
      },
      include: serviceId
        ? {
            server: true,
            serviceTargets: {
              where: { serviceId },
              include: { server: true },
            },
          }
        : { server: true },
    });

    if (environments.length === 0) {
      return;
    }

    const adminUser = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
    });

    if (!adminUser) {
      this.logger.warn('Auto-deploy: aucun administrateur actif trouvé');
      return;
    }

    const autoDeployMarker = this.buildAutoDeployMarker(pipelineId);
    const pipelineIdValue = this.toPipelineIdValueOrNull(pipelineId);

    for (const environment of environments) {
      try {
        if (pipelineIdValue || autoDeployMarker) {
          const existingDeployment = await this.prisma.deployment.findFirst({
            where: {
              projectId,
              ...(serviceId ? { serviceId } : {}),
              environmentId: environment.id,
              OR: [
                ...(pipelineIdValue
                  ? [
                      {
                        gitlabPipelineId: pipelineIdValue,
                      },
                    ]
                  : []),
                ...(autoDeployMarker
                  ? [
                      {
                        logs: {
                          contains: autoDeployMarker,
                        },
                      },
                    ]
                  : []),
              ],
            },
            select: { id: true },
          });

          if (existingDeployment) {
            continue;
          }
        }

        const deployment = await this.prisma.deployment.create({
          data: {
            projectId,
            environmentId: environment.id,
            userId: adminUser.id,
            branch,
            status: DeploymentStatus.PENDING,
            startedAt: new Date(),
            ...(pipelineIdValue ? { gitlabPipelineId: pipelineIdValue } : {}),
            logs: [
              `Auto-deploy déclenché par push sur ${branch}`,
              autoDeployMarker,
            ]
              .filter((entry): entry is string => Boolean(entry))
              .join('\n'),
            ...(dockerImage ? { dockerImage } : {}),
          },
        });

        this.gateway.emitStarted({
          deploymentId: deployment.id,
          projectId: deployment.projectId,
          environmentId: deployment.environmentId,
          status: deployment.status,
          startedAt: deployment.startedAt,
        });

        await this.ansibleService.deployWithAnsible(deployment.id, dockerImage);
      } catch (error) {
        this.logger.error(
          `Auto-deploy échoué pour environnement ${environment.id}: ${
            error instanceof Error ? error.message : 'erreur inconnue'
          }`,
        );
      }
    }
  }

  private mapDeploymentStatus(status: string): DeploymentStatus {
    const normalized = status.toLowerCase();
    if (normalized === 'success') {
      return DeploymentStatus.SUCCESS;
    }
    if (normalized === 'failed') {
      return DeploymentStatus.FAILED;
    }
    if (normalized === 'canceled' || normalized === 'cancelled') {
      return DeploymentStatus.CANCELED;
    }
    if (normalized === 'running') {
      return DeploymentStatus.RUNNING;
    }
    return DeploymentStatus.PENDING;
  }

  private buildPipelineMarker(pipelineId: number): string {
    return `[PIPELINE_ID:${String(pipelineId)}]`;
  }

  private buildWebhookSuccessClaimMarker(pipelineId: number): string {
    return `[WEBHOOK_SUCCESS_CLAIM:${String(pipelineId)}]`;
  }

  private buildWebhookFinalizationMarker(
    pipelineId: number,
    status: DeploymentStatus,
  ): string {
    return `[WEBHOOK_FINALIZED:${status}:${String(pipelineId)}]`;
  }

  private buildAutoDeployMarker(pipelineId?: number): string | null {
    if (!pipelineId) {
      return null;
    }
    return `[AUTO_DEPLOY_PIPELINE_ID:${String(pipelineId)}]`;
  }

  private toPipelineIdValue(pipelineId: number): bigint {
    return BigInt(pipelineId);
  }

  private toPipelineIdValueOrNull(pipelineId?: number): bigint | null {
    if (!pipelineId) {
      return null;
    }
    return this.toPipelineIdValue(pipelineId);
  }

  private sendDeploymentNotification(deployment: DeploymentWithRelations): void {
    void this.notificationsService.notifyDeploymentFinished({
      deploymentId: deployment.id,
      status: deployment.status as 'SUCCESS' | 'FAILED' | 'CANCELED',
      projectName: deployment.project.name,
      environmentName: deployment.environment.name,
      branch: deployment.branch,
      triggeredBy: deployment.user.fullName,
      pipelineUrl:
        deployment.project.gitlabUrl && deployment.gitlabPipelineId
          ? `${deployment.project.gitlabUrl}/-/pipelines/${String(deployment.gitlabPipelineId)}`
          : null,
    });
  }
}

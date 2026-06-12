import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DeploymentStatus, BuildPack, Prisma, BuildTrigger, BuildStatus } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { BuildLifecycleService } from '../../build/services/build-lifecycle.service';
import {
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type AutoDeployTriggerEvent,
} from '../events/deployment.events';
import { DockerDeployExecutorService } from './docker-deploy-executor.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';

/**
 * Handles automatic deployments triggered by a push event or pipeline success.
 *
 * Responsibility (single):
 *   Listen for DEPLOYMENT_AUTO_DEPLOY_TRIGGER events, find all environments
 *   with autoDeploy=true that match the branch, create a Deployment + Build
 *   record, and fire the Ansible playbook.
 *
 * The pipeline update logic (webhook SUCCESS → start deploy) lives in
 * DeploymentsPipelineHandlerService.
 */
@Injectable()
export class DeploymentsAutoTriggerService {
  private readonly logger = new Logger(DeploymentsAutoTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ansibleService: DockerDeployExecutorService,
    private readonly gateway: DeploymentsGateway,
    private readonly buildsService: BuildLifecycleService,
  ) {}

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
      },
    });

    if (environments.length === 0) return;

    const adminUser = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
    });
    if (!adminUser) {
      this.logger.warn('Auto-deploy: aucun administrateur actif trouvé');
      return;
    }

    const pipelineIdValue = pipelineId ? BigInt(pipelineId) : null;
    const autoDeployMarker = pipelineId ? `[AUTO_DEPLOY_PIPELINE_ID:${String(pipelineId)}]` : null;

    let buildPack: BuildPack = BuildPack.DOCKERFILE;
    let rawBuildStrategy = 'DOCKERFILE';
    let nixpacksConfig: Prisma.InputJsonValue | null = null;
    let staticConfig: Prisma.InputJsonValue | null = null;

    if (serviceId) {
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId },
        select: { buildPack: true, nixpacksConfig: true, staticConfig: true },
      });
      if (service) {
        rawBuildStrategy = (service.buildPack ?? BuildPack.DOCKERFILE) as string;
        buildPack = service.buildPack ?? BuildPack.DOCKERFILE;
        nixpacksConfig = service.nixpacksConfig as Prisma.InputJsonValue | null;
        staticConfig = service.staticConfig as Prisma.InputJsonValue | null;
      }
    }

    const isLocalBuild =
      buildPack === BuildPack.STATIC ||
      buildPack === BuildPack.DOCKER_COMPOSE ||
      buildPack === BuildPack.NIXPACKS ||
      buildPack === BuildPack.BUILDPACK ||
      rawBuildStrategy === 'LOCAL';

    for (const environment of environments) {
      try {
        if (pipelineIdValue || autoDeployMarker) {
          const existing = await this.prisma.deployment.findFirst({
            where: {
              projectId,
              ...(serviceId ? { serviceId } : {}),
              environmentId: environment.id,
              OR: [
                ...(pipelineIdValue ? [{ externalPipelineId: pipelineIdValue }] : []),
                ...(autoDeployMarker ? [{ logs: { contains: autoDeployMarker } }] : []),
              ],
            },
            select: { id: true },
          });
          if (existing) continue;
        }

        const deployment = await this.prisma.$transaction(async (tx) => {
          let serviceEnvId: string | null = null;
          if (serviceId) {
            const serviceEnv = await tx.serviceEnvironment.findUnique({
              where: { serviceId_environmentId: { serviceId, environmentId: environment.id } },
              select: { id: true },
            });
            serviceEnvId = serviceEnv?.id ?? null;
          }

          const build = await this.buildsService.create(
            {
              projectId,
              serviceId: serviceId ?? null,
              serviceEnvId,
              userId: adminUser.id,
              branch,
              buildPack,
              isLocalBuild,
              initialStatus: BuildStatus.BUILDING,
              triggeredBy: BuildTrigger.WEBHOOK,
              nixpacksConfig,
              staticConfig,
              externalPipelineId: pipelineIdValue ?? null,
            },
            tx,
          );

          return tx.deployment.create({
            data: {
              projectId,
              serviceId: serviceId ?? null,
              serviceEnvId,
              environmentId: environment.id,
              userId: adminUser.id,
              branch,
              status: DeploymentStatus.PENDING,
              startedAt: new Date(),
              buildId: build.id,
              ...(nixpacksConfig ? { nixpacksConfig } : {}),
              ...(staticConfig ? { staticConfig } : {}),
              ...(pipelineIdValue ? { externalPipelineId: pipelineIdValue } : {}),
              ...(dockerImage ? { dockerImage } : {}),
              logs: [
                `Auto-deploy déclenché par push sur ${branch}`,
                autoDeployMarker,
              ]
                .filter((e): e is string => Boolean(e))
                .join('\n'),
            },
          });
        });

        this.gateway.emitStarted({
          deploymentId: deployment.id,
          projectId: deployment.projectId,
          environmentId: deployment.environmentId,
          status: deployment.status,
          startedAt: deployment.startedAt,
        });

        await this.ansibleService.executeDeploy(deployment.id, dockerImage);
      } catch (error) {
        this.logger.error(
          `Auto-deploy échoué pour environnement ${environment.id}: ${
            error instanceof Error ? error.message : 'erreur inconnue'
          }`,
        );
      }
    }
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Deployment, DeploymentStatus, DeploymentStrategy, BuildMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateDeploymentDto } from '../dto/create-deployment.dto';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { GitlabService } from '../../git-providers/gitlab/gitlab.service';
import { EnvConfigsService } from '../../projects/app-configs/env-configs.service';
import { DockerImageService } from '../../build/image/docker-image.service';

@Injectable()
export class DeploymentsCreateService {
  private readonly logger = new Logger(DeploymentsCreateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitlabService: GitlabService,
    private readonly envConfigsService: EnvConfigsService,
    private readonly gateway: DeploymentsGateway,
    private readonly dockerService: DockerImageService,
    private readonly authorizationService: DeploymentsAuthorizationService,
  ) {}

  async create(dto: CreateDeploymentDto, userId: string): Promise<Deployment> {
    const actor = await this.authorizationService.getActor(userId);
    await this.authorizationService.assertCanDeployProject(
      dto.projectId,
      actor.id,
      actor.role,
    );

    const environment = await this.prisma.environment.findFirst({
      where: {
        id: dto.environmentId,
        projectId: dto.projectId,
      },
      include: {
        server: true,
        serviceTargets: {
          where: dto.serviceId ? { serviceId: dto.serviceId } : undefined,
          include: { server: true },
        },
      },
    });

    if (!environment) {
      throw new NotFoundException('Environnement non trouvé pour ce projet');
    }

    const service = dto.serviceId
      ? await this.prisma.projectService.findFirst({
          where: { id: dto.serviceId, projectId: dto.projectId },
        })
      : null;

    if (dto.serviceId && !service) {
      throw new NotFoundException('Service non trouvé pour ce projet');
    }

    const serviceTarget = dto.serviceId ? environment.serviceTargets[0] : null;
    if (dto.serviceId && !serviceTarget) {
      throw new BadRequestException(
        'Aucune cible VPS configurée pour ce service dans cet environnement',
      );
    }
    const targetServer = serviceTarget?.server ?? environment.server;

    if (!targetServer.isVerified) {
      throw new BadRequestException('Le serveur cible doit être vérifié');
    }

    const dockerTool = await this.prisma.serverInstalledTool.findFirst({
      where: {
        serverId: targetServer.id,
        toolKey: 'docker',
        status: 'INSTALLED',
      },
      select: { id: true },
    });
    if (!dockerTool) {
      throw new BadRequestException(
        "Docker n'est pas installé sur le serveur cible. Préparez le serveur via l'onglet Servers.",
      );
    }

    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      include: { gitlabConfig: true },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    if (!project.gitlabConfig) {
      throw new BadRequestException(
        'Configuration GitLab manquante sur ce projet',
      );
    }

    await this.envConfigsService.getMergedDecrypted(
      dto.projectId,
      dto.environmentId,
      actor.id,
      actor.role,
    );

    const branch = dto.branch ?? service?.defaultBranch ?? project.branch;
    const repositoryId =
      dto.repoId ??
      (service?.gitlabProjectId ? Number(service.gitlabProjectId) : undefined);

    let dockerImage: string;
    if (dto.overrideImage) {
      dockerImage = dto.overrideImage;
      this.logger.log(`[CreateDeployment] Using external image: ${dockerImage}`);
    } else if (dto.buildMode === 'compose') {
      // Sentinel détecté par DeploymentsAnsibleService pour router vers deploy-compose.yml.
      // Pas de build/pull d'image : docker-compose gère ses propres images depuis le fichier.
      dockerImage = `compose://${project.name}`;
      this.logger.log(
        `[CreateDeployment] Using docker-compose build mode (sentinel: ${dockerImage})`,
      );
    } else if (dto.buildMode === 'local') {
      dockerImage = `${project.name}:${branch || 'latest'}`;
      this.logger.log(
        `[CreateDeployment] Using local build mode with image: ${dockerImage}`,
      );
    } else {
      dockerImage = await this.dockerService.buildDockerImage({
        gitlabConfig: project.gitlabConfig,
        projectName: service ? `${project.name}-${service.name}` : project.name,
        projectGitlabUrl: project.gitlabUrl,
        branch,
        repositoryId,
      });
    }

    const activeDeployment = await this.prisma.deployment.findFirst({
      where: {
        environmentId: dto.environmentId,
        status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
      },
      select: { id: true, status: true, createdAt: true },
    });

    if (activeDeployment) {
      throw new BadRequestException(
        `Un déploiement est déjà en cours sur cet environnement ` +
        `(ID: ${activeDeployment.id}, statut: ${activeDeployment.status}). ` +
        `Attendez la fin du déploiement actuel avant d'en lancer un nouveau.`,
      );
    }

    let deployment = await this.prisma.deployment.create({
      data: {
        projectId: dto.projectId,
        serviceId: service?.id,
        environmentId: dto.environmentId,
        userId: actor.id,
        branch,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
        strategy: dto.strategy === 'blue-green'
          ? DeploymentStrategy.BLUE_GREEN
          : DeploymentStrategy.STANDARD,
        buildMode:
          dto.buildMode === 'local' || dto.buildMode === 'compose'
            ? BuildMode.LOCAL
            : BuildMode.REGISTRY,
      },
    });

    await this.recordAuditLog(actor.id, 'DEPLOYMENT_CREATE', deployment.id, {
      projectId: dto.projectId,
      environmentId: dto.environmentId,
      serviceId: service?.id,
      branch,
    });

    this.gateway.emitStarted({
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      environmentId: deployment.environmentId,
      status: deployment.status,
      startedAt: deployment.startedAt,
    });

    let pipeline: { id: number };
    try {
      pipeline = await this.gitlabService.triggerPipeline(
        dto.projectId,
        branch,
        actor.id,
        actor.role,
        repositoryId,
      );
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : 'Échec du déclenchement du pipeline GitLab';

      const failed = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\n${reason}`.trim(),
        },
      });

      this.gateway.emitStatus({
        deploymentId: failed.id,
        status: failed.status,
      });
      this.gateway.emitFinished({
        deploymentId: failed.id,
        status: failed.status,
        finishedAt: failed.finishedAt,
      });

      throw error;
    }

    deployment = await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.RUNNING,
        logs: `Déploiement lancé. ${this.buildPipelineMarker(pipeline.id)}`,
        gitlabPipelineId: this.toPipelineIdValue(pipeline.id),
        dockerImage,
      },
    });

    this.gateway.emitStatus({
      deploymentId: deployment.id,
      status: deployment.status,
    });

    return deployment;
  }

  private buildPipelineMarker(pipelineId: number): string {
    return `[PIPELINE_ID:${String(pipelineId)}]`;
  }

  private toPipelineIdValue(pipelineId: number): bigint {
    return BigInt(pipelineId);
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

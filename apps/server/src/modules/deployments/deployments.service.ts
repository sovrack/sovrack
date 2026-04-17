import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
  BadRequestException,
} from '@nestjs/common';
import {
  Deployment,
  DeploymentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { ConfigsService } from '../configs/configs.service';
import { GitlabService } from '../gitlab/gitlab.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { DeploymentsAnsibleService } from './deployments-ansible.service';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { DeploymentsDockerService } from './deployments-docker.service';
import { DeploymentsGateway } from './deployments.gateway';

const deploymentRelationsInclude = {
  project: {
    select: {
      id: true,
      name: true,
      gitlabUrl: true,
    },
  },
  environment: {
    select: {
      id: true,
      name: true,
      server: {
        select: {
          id: true,
          name: true,
          host: true,
        },
      },
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
    },
  },
} satisfies Prisma.DeploymentInclude;

type DeploymentWithRelations = Prisma.DeploymentGetPayload<{
  include: typeof deploymentRelationsInclude;
}>;

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => GitlabService))
    private readonly gitlabService: GitlabService,
    private readonly configsService: ConfigsService,
    private readonly gateway: DeploymentsGateway,
    private readonly ansibleService: DeploymentsAnsibleService,
    private readonly dockerService: DeploymentsDockerService,
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
      },
    });

    if (!environment) {
      throw new NotFoundException('Environnement non trouvé pour ce projet');
    }

    if (!environment.server.isVerified) {
      throw new BadRequestException('Le serveur cible doit être vérifié');
    }

    if (!environment.server.hasDocker) {
      throw new BadRequestException(
        'Le serveur cible doit avoir Docker installé',
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

    await this.configsService.getDecrypted(dto.projectId, actor.id, actor.role);

    const branch = dto.branch ?? project.branch;
    const dockerImage = await this.dockerService.buildDockerImage({
      gitlabConfig: project.gitlabConfig,
      projectName: project.name,
      projectGitlabUrl: project.gitlabUrl,
      branch,
      repositoryId: dto.repoId,
    });

    let deployment = await this.prisma.deployment.create({
      data: {
        projectId: dto.projectId,
        environmentId: dto.environmentId,
        userId: actor.id,
        branch,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
      },
    });

    await this.recordAuditLog(actor.id, 'DEPLOYMENT_CREATE', deployment.id, {
      projectId: dto.projectId,
      environmentId: dto.environmentId,
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
        dto.repoId,
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
        logs: `Déploiement lancé. [PIPELINE_ID:${String(pipeline.id)}]`,
        dockerImage,
      },
    });

    this.gateway.emitStatus({
      deploymentId: deployment.id,
      status: deployment.status,
    });

    return deployment;
  }

  async handleWebhookUpdate(
    pipelineId: number,
    status: string,
    image?: string,
  ): Promise<{ status: 'ok' | 'ignored' }> {
    const marker = `[PIPELINE_ID:${String(pipelineId)}]`;

    const deployment = await this.prisma.deployment.findFirst({
      where: {
        logs: {
          contains: marker,
        },
        status: {
          in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!deployment) {
      return { status: 'ignored' };
    }

    const mappedStatus = this.mapDeploymentStatus(status);

    if (mappedStatus === DeploymentStatus.SUCCESS) {
      await this.ansibleService.deployWithAnsible(deployment.id, image);
      return { status: 'ok' };
    }

    if (
      mappedStatus === DeploymentStatus.FAILED ||
      mappedStatus === DeploymentStatus.CANCELED
    ) {
      const updated = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: mappedStatus,
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\nPipeline GitLab: ${status}`.trim(),
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
    }

    return { status: 'ok' };
  }

  async findAll(
    userId: string,
    userRole: Role,
  ): Promise<DeploymentWithRelations[]> {
    const where: Prisma.DeploymentWhereInput | undefined =
      userRole === Role.ADMIN
        ? undefined
        : {
            project: {
              members: {
                some: {
                  userId,
                },
              },
            },
          };

    return await this.prisma.deployment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: deploymentRelationsInclude,
    });
  }

  async findByProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<DeploymentWithRelations[]> {
    await this.authorizationService.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );

    return await this.prisma.deployment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: deploymentRelationsInclude,
    });
  }

  async findOne(
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<DeploymentWithRelations> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: deploymentRelationsInclude,
    });

    if (!deployment) {
      throw new NotFoundException('Déploiement non trouvé');
    }

    await this.authorizationService.assertCanAccessProject(
      deployment.projectId,
      userId,
      userRole,
    );

    return deployment;
  }

  async cancel(id: string, userId: string, userRole: Role): Promise<Deployment> {
    const deployment = await this.findOne(id, userId, userRole);
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

  async rollback(
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<Deployment> {
    const deployment = await this.findOne(id, userId, userRole);
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

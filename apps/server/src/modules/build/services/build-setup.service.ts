import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GitlabSourceType, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { BuildService } from '../build.service';
import { CreateBuildConfigDto } from '../dto/create-build-config.dto';
import { GitlabFilePusherService } from '../pusher/gitlab-file-pusher.service';
import { GitlabWebhookConfiguratorService } from '../pusher/gitlab-webhook-configurator.service';

const SUPPORTED_TYPES = [
  'nestjs',
  'nextjs',
  'react',
  'nodejs',
  'go',
  'python',
  'django',
  'laravel',
  'spring-boot',
  'java',
  'php',
  'ruby',
  'golang',
  'rust',
  'postgres-service',
  'redis-service',
  'static-frontend',
  'static',
  'dockerized',
  'compose',
  'docker',
  'unknown',
];

type BuildArtifactStatus = 'CREATED' | 'UPDATED' | 'SKIPPED' | 'FAILED';
type BuildPrepareStatus = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
type BuildWebhookStatus =
  | 'CONFIGURED'
  | 'PENDING_CONFIGURATION'
  | 'FAILED'
  | 'DISABLED';

type BuildPrepareServiceResult = {
  serviceId: string;
  serviceName: string;
  status: BuildPrepareStatus;
  message: string;
  dockerfileStatus: BuildArtifactStatus;
  dockerignoreStatus: BuildArtifactStatus;
  ciStatus: BuildArtifactStatus;
  webhookStatus: BuildWebhookStatus;
  webhookMessage: string | null;
  pipelineUrl: string | null;
};

@Injectable()
export class BuildSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitlabFilePusher: GitlabFilePusherService,
    private readonly webhookConfigurator: GitlabWebhookConfiguratorService,
    private readonly buildService: BuildService,
  ) {}

  async getTemplates(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<{ types: string[] }> {
    await this.buildService.assertCanConfigureBuild(projectId, userId, userRole);
    return { types: SUPPORTED_TYPES };
  }

  async updateBuildConfig(
    projectId: string,
    dto: CreateBuildConfigDto,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.buildService.assertCanConfigureBuild(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.projectType !== undefined && { projectType: dto.projectType }),
        ...(dto.buildPort !== undefined && { buildPort: dto.buildPort }),
        ...(dto.buildStartCmd !== undefined && {
          buildStartCmd: dto.buildStartCmd,
        }),
        ...(dto.autoDeploy !== undefined && { autoDeploy: dto.autoDeploy }),
        ...(dto.autoDeployBranch !== undefined && {
          autoDeployBranch: dto.autoDeployBranch,
        }),
        ...(dto.dockerfileContent !== undefined && {
          dockerfileContent: dto.dockerfileContent,
        }),
        ...(dto.gitlabCiContent !== undefined && {
          gitlabCiContent: dto.gitlabCiContent,
        }),
      },
    });
  }

  async prepareAll(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<{ results: BuildPrepareServiceResult[] }> {
    await this.buildService.assertCanConfigureBuild(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        gitlabConfig: { select: { sourceType: true } },
      },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    const services = await this.prisma.projectService.findMany({
      where: { projectId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    if (
      project.gitlabConfig?.sourceType === GitlabSourceType.GROUP &&
      services.length === 0
    ) {
      throw new BadRequestException(
        'Aucun service trouvé pour ce projet GROUP. Importez les repositories comme services avant la préparation.',
      );
    }

    const targets =
      services.length > 0
        ? services.map((service) => ({
            serviceId: service.id,
            serviceName: service.name,
          }))
        : [
            {
              serviceId: project.id,
              serviceName: project.name,
            },
          ];

    const results: BuildPrepareServiceResult[] = [];

    for (const target of targets) {
      try {
        const prepared = await this.buildService.prepareServiceInternal(
          projectId,
          services.length > 0 ? target.serviceId : undefined,
        );
        results.push(prepared.serviceResult);
      } catch (error: unknown) {
        results.push({
          serviceId: target.serviceId,
          serviceName: target.serviceName,
          status: 'FAILED',
          message: this.buildService.extractErrorMessage(error),
          dockerfileStatus: 'FAILED',
          dockerignoreStatus: 'FAILED',
          ciStatus: 'FAILED',
          webhookStatus: 'FAILED',
          webhookMessage: null,
          pipelineUrl: null,
        });
      }
    }

    return { results };
  }

  async reconcileWebhooks(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<{ results: BuildPrepareServiceResult[] }> {
    await this.buildService.assertCanConfigureBuild(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        gitlabConfig: { select: { sourceType: true } },
      },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    const services = await this.prisma.projectService.findMany({
      where: { projectId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    if (
      project.gitlabConfig?.sourceType === GitlabSourceType.GROUP &&
      services.length === 0
    ) {
      throw new BadRequestException(
        'Aucun service trouvé pour ce projet GROUP. Importez les repositories comme services avant la configuration des webhooks.',
      );
    }

    const targets =
      services.length > 0
        ? services.map((service) => ({
            serviceId: service.id,
            serviceName: service.name,
          }))
        : [
            {
              serviceId: project.id,
              serviceName: project.name,
            },
          ];

    const results: BuildPrepareServiceResult[] = [];
    const webhookAutoConfigureEnabled = this.buildService.isWebhookAutoConfigureEnabled();

    for (const target of targets) {
      if (!webhookAutoConfigureEnabled) {
        results.push({
          serviceId: target.serviceId,
          serviceName: target.serviceName,
          status: 'SUCCESS',
          message:
            'Configuration webhook désactivée par la plateforme. Aucune action exécutée.',
          dockerfileStatus: 'SKIPPED',
          dockerignoreStatus: 'SKIPPED',
          ciStatus: 'SKIPPED',
          webhookStatus: 'DISABLED',
          webhookMessage: null,
          pipelineUrl: null,
        });
        continue;
      }

      try {
        await this.webhookConfigurator.configureWebhook(
          projectId,
          services.length > 0 ? target.serviceId : undefined,
        );
        results.push({
          serviceId: target.serviceId,
          serviceName: target.serviceName,
          status: 'SUCCESS',
          message: 'Webhook GitLab configuré avec succès.',
          dockerfileStatus: 'SKIPPED',
          dockerignoreStatus: 'SKIPPED',
          ciStatus: 'SKIPPED',
          webhookStatus: 'CONFIGURED',
          webhookMessage: null,
          pipelineUrl: null,
        });
      } catch (error: unknown) {
        const details = this.buildService.extractErrorMessage(error);
        if (this.buildService.shouldTreatWebhookErrorAsWarning(error)) {
          results.push({
            serviceId: target.serviceId,
            serviceName: target.serviceName,
            status: 'PARTIAL_SUCCESS',
            message:
              'Webhook GitLab non configuré automatiquement. Action de configuration requise.',
            dockerfileStatus: 'SKIPPED',
            dockerignoreStatus: 'SKIPPED',
            ciStatus: 'SKIPPED',
            webhookStatus: 'PENDING_CONFIGURATION',
            webhookMessage: details,
            pipelineUrl: null,
          });
          continue;
        }

        results.push({
          serviceId: target.serviceId,
          serviceName: target.serviceName,
          status: 'FAILED',
          message: details,
          dockerfileStatus: 'SKIPPED',
          dockerignoreStatus: 'SKIPPED',
          ciStatus: 'SKIPPED',
          webhookStatus: 'FAILED',
          webhookMessage: details,
          pipelineUrl: null,
        });
      }
    }

    return { results };
  }

  async getBuildStatus(projectId: string): Promise<{
    projectDockerfileReady: boolean;
    projectCiReady: boolean;
    sourceType: 'REPO' | 'GROUP' | null;
    services: Array<{
      id: string;
      name: string;
      type: string;
      repositoryPath: string | null;
      defaultBranch: string;
      gitlabProjectId: string | null;
      ready: boolean;
      missingRequirements: string[];
      lastPipeline: {
        id: number;
        status: string;
        ref: string;
        webUrl: string;
      } | null;
    }>;
  }> {
    const [project, services] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: {
          dockerfileContent: true,
          gitlabCiContent: true,
          gitlabConfig: {
            select: {
              sourceType: true,
              gitlabToken: true,
            },
          },
        },
      }),
      this.prisma.projectService.findMany({
        where: { projectId },
        include: {
          pipelines: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { gitlabId: true, status: true, ref: true, webUrl: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const sourceType = project?.gitlabConfig?.sourceType ?? null;
    const tokenConfigured = Boolean(project?.gitlabConfig?.gitlabToken);

    return {
      projectDockerfileReady: Boolean(project?.dockerfileContent),
      projectCiReady: Boolean(project?.gitlabCiContent),
      sourceType,
      services: services.map((service) => {
        const missingRequirements: string[] = [];

        if (!tokenConfigured) {
          missingRequirements.push('Token GitLab manquant');
        }
        if (!service.gitlabProjectId) {
          missingRequirements.push('GitLab project ID manquant');
        }
        if (!service.defaultBranch?.trim()) {
          missingRequirements.push('Branche manquante');
        }
        if (sourceType === GitlabSourceType.GROUP && !service.repositoryPath) {
          missingRequirements.push('repositoryPath manquant');
        }

        return {
          id: service.id,
          name: service.name,
          type: service.type,
          repositoryPath: service.repositoryPath,
          defaultBranch: service.defaultBranch,
          gitlabProjectId: service.gitlabProjectId
            ? String(service.gitlabProjectId)
            : null,
          ready: missingRequirements.length === 0,
          missingRequirements,
          lastPipeline: service.pipelines[0]
            ? {
                id: Number(service.pipelines[0].gitlabId),
                status: service.pipelines[0].status,
                ref: service.pipelines[0].ref,
                webUrl: service.pipelines[0].webUrl,
              }
            : null,
        };
      }),
    };
  }
}

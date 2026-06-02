import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitlabSourceType, ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { BuildDetectorService } from './build-detector.service';
import { DockerfileGenerator } from './generators/dockerfile/dockerfile.generator';
import { GitlabCiGenerator } from './generators/gitlab-ci.generator';
import { DockerignoreGenerator } from './generators/dockerignore.generator';
import {
  GitlabFilePusherService,
  type BuildRepoPushResult,
} from './pusher/gitlab-file-pusher.service';
import { GitlabWebhookConfiguratorService } from './pusher/gitlab-webhook-configurator.service';

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

type BuildPrepareResponse = {
  type: string;
  confidence: string;
  language: string;
  framework: string;
  packageManager: string;
  recommendedStrategy: string;
  recommendedBuildType: string;
  recommendedStartCommand: string;
  recommendedPort: number;
  reasons: string[];
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasCiConfig: boolean;
  dockerfileContent: string;
  dockerignoreContent: string;
  gitlabCiContent: string;
  serviceResult: BuildPrepareServiceResult;
};

@Injectable()
export class BuildService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detector: BuildDetectorService,
    private readonly dockerfileGenerator: DockerfileGenerator,
    private readonly gitlabCiGenerator: GitlabCiGenerator,
    private readonly dockerignoreGenerator: DockerignoreGenerator,
    private readonly gitlabFilePusher: GitlabFilePusherService,
    private readonly webhookConfigurator: GitlabWebhookConfiguratorService,
    private readonly configService: ConfigService,
  ) {}

  async prepare(
    projectId: string,
    userId: string,
    userRole: Role,
    serviceId?: string,
    overwriteDockerfile?: boolean,
    overwriteGitlabCi?: boolean,
  ): Promise<BuildPrepareResponse> {
    await this.assertCanConfigureBuild(projectId, userId, userRole);
    return await this.prepareServiceInternal(projectId, serviceId, overwriteDockerfile, overwriteGitlabCi);
  }

  async pushFiles(
    projectId: string,
    userId: string,
    userRole: Role,
    serviceId?: string,
  ): Promise<void> {
    await this.assertCanConfigureBuild(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { gitlabConfig: true },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    if (!project.dockerfileContent || !project.gitlabCiContent) {
      throw new BadRequestException(
        "Les fichiers doivent être générés avant d'être poussés.",
      );
    }

    await this.gitlabFilePusher.pushFilesToRepo(
      projectId,
      {
        Dockerfile: project.dockerfileContent,
        '.dockerignore': this.dockerignoreGenerator.generate(),
        '.gitlab-ci.yml': project.gitlabCiContent,
      },
      serviceId,
    );
  }



  async assertCanConfigureBuild(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    if (userRole === Role.ADMIN) {
      return;
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      select: {
        role: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Accès non autorisé au projet');
    }

    if (membership.role === ProjectRole.VIEWER) {
      throw new ForbiddenException(
        'Le rôle VIEWER ne peut pas configurer le build',
      );
    }
  }

  async prepareServiceInternal(
    projectId: string,
    serviceId?: string,
    overwriteDockerfile?: boolean,
    overwriteGitlabCi?: boolean,
  ): Promise<BuildPrepareResponse> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { gitlabConfig: true },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    if (
      project.gitlabConfig?.sourceType === GitlabSourceType.GROUP &&
      !serviceId
    ) {
      throw new BadRequestException(
        'serviceId est requis en mode GROUP pour préparer le build.',
      );
    }

    const service = serviceId
      ? await this.prisma.projectService.findFirst({
          where: { id: serviceId, projectId },
          select: {
            id: true,
            name: true,
          },
        })
      : null;

    if (serviceId && !service) {
      throw new NotFoundException('Service introuvable');
    }

    const detected = await this.detector.detectProjectType(
      projectId,
      serviceId,
    );
    const type =
      project.projectType || detected.recommendedBuildType || detected.type;
    const port =
      project.buildPort ?? detected.recommendedPort ?? project.port ?? 3000;
    const startCmd =
      project.buildStartCmd ??
      detected.recommendedStartCommand ??
      'node index.js';
    const registryUrl = project.gitlabConfig?.registryUrl ?? undefined;

    const shouldGenerateDockerfile = !project.dockerfileContent || overwriteDockerfile === true;
    const shouldGenerateGitlabCi = !project.gitlabCiContent || overwriteGitlabCi === true;

    const dockerfileContent = shouldGenerateDockerfile
      ? this.dockerfileGenerator.generate(type, { port, startCmd })
      : project.dockerfileContent!;
    const dockerignoreContent = this.dockerignoreGenerator.generate();
    const gitlabCiContent = shouldGenerateGitlabCi
      ? this.gitlabCiGenerator.generate({ registryUrl })
      : project.gitlabCiContent!;

    const filesToPush: Record<string, string> = {};
    if (shouldGenerateDockerfile) {
      filesToPush['Dockerfile'] = dockerfileContent;
      filesToPush['.dockerignore'] = dockerignoreContent;
    }
    if (shouldGenerateGitlabCi) {
      filesToPush['.gitlab-ci.yml'] = gitlabCiContent;
    }

    const pushResult = Object.keys(filesToPush).length > 0
      ? await this.gitlabFilePusher.pushFilesToRepo(projectId, filesToPush, serviceId)
      : {
          branch: project.gitlabConfig?.defaultBranch ?? 'main',
          gitlabProjectId: project.gitlabConfig?.gitlabId?.toString() ?? '',
          repositoryPath: null,
          fileStatuses: {} as Record<string, never>,
        };

    let webhookWarning: string | null = null;
    const webhookAutoConfigureEnabled = this.isWebhookAutoConfigureEnabled();
    if (webhookAutoConfigureEnabled) {
      try {
        await this.webhookConfigurator.configureWebhook(projectId, serviceId);
      } catch (error: unknown) {
        if (this.shouldTreatWebhookErrorAsWarning(error)) {
          webhookWarning = this.extractErrorMessage(error);
        } else {
          throw error;
        }
      }
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        projectType: type,
        ...(shouldGenerateDockerfile && { dockerfileContent }),
        ...(shouldGenerateGitlabCi && { gitlabCiContent }),
      },
    });

    const pipelineUrl = await this.resolveLatestPipelineUrl(
      projectId,
      serviceId,
    );
    const serviceResult = this.buildSuccessServiceResult(
      project,
      service,
      pushResult,
      pipelineUrl,
      webhookWarning,
      webhookAutoConfigureEnabled,
    );

    return {
      type,
      confidence: detected.confidence,
      language: detected.language,
      framework: detected.framework,
      packageManager: detected.packageManager,
      recommendedStrategy: detected.recommendedStrategy,
      recommendedBuildType: detected.recommendedBuildType,
      recommendedStartCommand: detected.recommendedStartCommand,
      recommendedPort: detected.recommendedPort,
      reasons: detected.reasons,
      hasDockerfile: detected.hasDockerfile,
      hasDockerCompose: detected.hasDockerCompose,
      hasCiConfig: detected.hasCiConfig,
      dockerfileContent,
      dockerignoreContent,
      gitlabCiContent,
      serviceResult,
    };
  }

  private buildSuccessServiceResult(
    project: { id: string; name: string },
    service: { id: string; name: string } | null,
    pushResult: BuildRepoPushResult,
    pipelineUrl: string | null,
    webhookWarning: string | null,
    webhookAutoConfigureEnabled: boolean,
  ): BuildPrepareServiceResult {
    if (!webhookAutoConfigureEnabled) {
      return {
        serviceId: service?.id ?? project.id,
        serviceName: service?.name ?? project.name,
        status: 'SUCCESS',
        message:
          'Préparation terminée avec succès. Configuration webhook désactivée par la plateforme.',
        dockerfileStatus: pushResult.fileStatuses.Dockerfile ?? 'SKIPPED',
        dockerignoreStatus:
          pushResult.fileStatuses['.dockerignore'] ?? 'SKIPPED',
        ciStatus: pushResult.fileStatuses['.gitlab-ci.yml'] ?? 'SKIPPED',
        webhookStatus: 'DISABLED',
        webhookMessage: null,
        pipelineUrl,
      };
    }

    const isPartial = Boolean(webhookWarning);
    const message = isPartial
      ? 'Fichiers préparés avec succès, mais webhook GitLab non configuré.'
      : 'Préparation terminée avec succès.';

    return {
      serviceId: service?.id ?? project.id,
      serviceName: service?.name ?? project.name,
      status: isPartial ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      message,
      dockerfileStatus: pushResult.fileStatuses.Dockerfile ?? 'SKIPPED',
      dockerignoreStatus: pushResult.fileStatuses['.dockerignore'] ?? 'SKIPPED',
      ciStatus: pushResult.fileStatuses['.gitlab-ci.yml'] ?? 'SKIPPED',
      webhookStatus: isPartial ? 'PENDING_CONFIGURATION' : 'CONFIGURED',
      webhookMessage: webhookWarning,
      pipelineUrl,
    };
  }

  shouldTreatWebhookErrorAsWarning(error: unknown): boolean {
    const message = this.extractErrorMessage(error).toLowerCase();
    return (
      message.includes('webhook_url') ||
      message.includes('url du webhook') ||
      message.includes('webhook non configuré')
    );
  }

  isWebhookAutoConfigureEnabled(): boolean {
    const raw = this.configService.get<string>('GITLAB_WEBHOOK_AUTO_CONFIGURE', 'false').trim().toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(raw ?? '');
  }

  private async resolveLatestPipelineUrl(
    projectId: string,
    serviceId?: string,
  ): Promise<string | null> {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: {
        projectId,
        ...(serviceId ? { serviceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { webUrl: true },
    });

    return pipeline?.webUrl ?? null;
  }

  extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object') {
      const payload = error as { message?: unknown };
      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return 'Erreur inconnue pendant la préparation du build.';
  }
}

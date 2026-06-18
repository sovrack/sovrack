import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppSourceType, ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { BuildDetectorService } from './detection/build-detector.service';
import { DockerfileGenerator } from './generators/config-files/dockerfile.generator';
import { DockerignoreGenerator } from './generators/config-files/dockerignore.generator';
import { CiGeneratorFactory } from './generators/ci/ci-generator.factory';
import { GitProvidersService } from '../git-providers/git-providers.service';
import type { RepoWriteResult } from '../git-providers/interfaces/git-provider.interface';
import type {
  BuildArtifactStatus,
  BuildPrepareStatus,
  BuildPrepareServiceResult,
  BuildPrepareResponse,
} from './types/build-prepare.types';

@Injectable()
export class BuildService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detector: BuildDetectorService,
    private readonly dockerfileGenerator: DockerfileGenerator,
    private readonly dockerignoreGenerator: DockerignoreGenerator,
    private readonly ciGeneratorFactory: CiGeneratorFactory,
    private readonly gitProvidersService: GitProvidersService,
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
      include: { appProviderLink: true },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    if (!project.dockerfileContent || !project.ciConfigContent) {
      throw new BadRequestException(
        "Les fichiers doivent être générés avant d'être poussés.",
      );
    }

    const provider = await this.gitProvidersService.forProject(projectId);
    await provider.writeFiles(
      projectId,
      {
        Dockerfile: project.dockerfileContent,
        '.dockerignore': this.dockerignoreGenerator.generate(),
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
      include: { appProviderLink: true },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    if (
      project.appProviderLink?.sourceType === AppSourceType.GROUP &&
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
            defaultBranch: true,
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
    // Resolve the project type used to drive both Dockerfile template selection
    // and GitLab-CI test stage generation. The DB column is free-form (any
    // string the user typed) — if it doesn't match a known language alias we
    // fall through to the detector so the test stage isn't silently dropped.
    const knownLanguageAliases = new Set([
      'nodejs', 'nestjs', 'nextjs', 'react', 'python', 'django',
      'go', 'golang', 'java', 'spring-boot', 'ruby', 'php', 'laravel', 'rust',
    ]);
    const userType = (project.projectType ?? '').toLowerCase();
    const type = userType && knownLanguageAliases.has(userType)
      ? userType
      : (detected.recommendedBuildType || detected.type);
    const port =
      project.buildPort ?? detected.recommendedPort ?? project.port ?? 3000;
    const startCmd =
      project.buildStartCmd ??
      detected.recommendedStartCommand ??
      'node index.js';
    const registryUrl = project.appProviderLink?.registryUrl ?? undefined;

    const shouldGenerateDockerfile = !project.dockerfileContent || overwriteDockerfile === true;
    const shouldGenerateGitlabCi = !project.ciConfigContent || overwriteGitlabCi === true;

    const dockerfileContent = shouldGenerateDockerfile
      ? this.dockerfileGenerator.generate(type, { port, startCmd })
      : project.dockerfileContent!;
    const dockerignoreContent = this.dockerignoreGenerator.generate();
    const branches = [
      project.branch,
      service?.defaultBranch,
    ].filter((b): b is string => Boolean(b));
    const uniqueBranches = Array.from(new Set(branches));

    const ciGenerator = await this.ciGeneratorFactory.forProject(projectId);
    const ciConfigContent = shouldGenerateGitlabCi
      ? ciGenerator.generate({
          registryUrl,
          projectType: type,
          branches: uniqueBranches.length > 0 ? uniqueBranches : undefined,
        })
      : project.ciConfigContent!;

    const filesToPush: Record<string, string> = {};
    if (shouldGenerateDockerfile) {
      filesToPush['Dockerfile'] = dockerfileContent;
      filesToPush['.dockerignore'] = dockerignoreContent;
    }
    // SECURITY: .gitlab-ci.yml is generated + saved to project for the user
    // to copy manually — never auto-pushed (would overwrite client CI).

    let pushResult: RepoWriteResult | null = null;
    if (Object.keys(filesToPush).length > 0) {
      const provider = await this.gitProvidersService.forProject(projectId);
      pushResult = await provider.writeFiles(projectId, filesToPush, serviceId);
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        projectType: type,
        ...(shouldGenerateDockerfile && { dockerfileContent }),
        ...(shouldGenerateGitlabCi && { ciConfigContent }),
      },
    });

    const pipelineUrl = await this.resolveLatestPipelineUrl(projectId, serviceId);
    const serviceResult = this.buildSuccessServiceResult(project, service, pushResult, pipelineUrl);

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
      ciConfigContent,
      ciConfigFilePath: ciGenerator.getFilePath(),
      serviceResult,
    };
  }

  private buildSuccessServiceResult(
    project: { id: string; name: string },
    service: { id: string; name: string } | null,
    pushResult: RepoWriteResult | null,
    pipelineUrl: string | null,
  ): BuildPrepareServiceResult {
    return {
      serviceId: service?.id ?? project.id,
      serviceName: service?.name ?? project.name,
      status: 'SUCCESS',
      message: 'Préparation terminée avec succès.',
      dockerfileStatus: pushResult?.fileStatuses?.['Dockerfile'] ?? 'SKIPPED',
      dockerignoreStatus: pushResult?.fileStatuses?.['.dockerignore'] ?? 'SKIPPED',
      ciStatus: 'SKIPPED',
      pipelineUrl,
    };
  }

  private async resolveLatestPipelineUrl(
    projectId: string,
    serviceId?: string,
  ): Promise<string | null> {
    const run = await this.prisma.pipelineRun.findFirst({
      where: { projectId, ...(serviceId ? { serviceId } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { webUrl: true },
    });
    return run?.webUrl ?? null;
  }
}

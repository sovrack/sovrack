import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { BuildDetectorService } from './detection/build-detector.service';
import { DockerfileGenerator } from './generation/dockerfiles/dockerfile.generator';
import { DockerignoreGenerator } from './generation/dockerfiles/dockerignore.generator';
import { CiGeneratorFactory } from './generation/ci/ci-generator.factory';
import { SourceProvidersService } from '../source-providers/source-providers.service';
import type { RepoWriteResult } from '../source-providers/contracts/git-provider.contract';
import type {
  BuildArtifactStatus,
  BuildPrepareStatus,
  BuildPrepareServiceResult,
  BuildPrepareResponse,
} from './types/build-prepare.types';

@Injectable()
export class BuildOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detector: BuildDetectorService,
    private readonly dockerfileGenerator: DockerfileGenerator,
    private readonly dockerignoreGenerator: DockerignoreGenerator,
    private readonly ciGeneratorFactory: CiGeneratorFactory,
    private readonly gitProvidersService: SourceProvidersService,
  ) {}

  async generateBuildFiles(
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
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    // Invariant : provider lié au SERVICE — résolution par service si dispo.
    const provider = serviceId
      ? await this.gitProvidersService.forService(serviceId)
      : await this.gitProvidersService.forProject(projectId);
    await provider.writeFiles(
      projectId,
      {
        Dockerfile: 'FROM node:20\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD ["node", "dist/main"]',
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
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    const service = serviceId
      ? await this.prisma.service.findFirst({
          where: { id: serviceId, projectId },
          select: {
            id: true,
            name: true,
            branch: true,
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
    const knownLanguageAliases = new Set([
      'nodejs', 'nestjs', 'nextjs', 'react', 'python', 'django',
      'go', 'golang', 'java', 'spring-boot', 'ruby', 'php', 'laravel', 'rust',
    ]);
    const type = detected.recommendedBuildType || detected.type;
    const port = detected.recommendedPort ?? 3000;
    const startCmd = detected.recommendedStartCommand ?? 'node index.js';

    const dockerfileContent = this.dockerfileGenerator.generate(type, { port, startCmd });
    const dockerignoreContent = this.dockerignoreGenerator.generate();
    const branches = [service?.branch].filter((b): b is string => Boolean(b));
    const uniqueBranches = Array.from(new Set(branches));

    const ciGenerator = await this.ciGeneratorFactory.forProject(projectId);
    const ciConfigContent = ciGenerator.generate({
      projectType: type,
      branches: uniqueBranches.length > 0 ? uniqueBranches : undefined,
    });

    const shouldGenerateDockerfile = overwriteDockerfile ?? true;
    const filesToPush: Record<string, string> = {};
    if (shouldGenerateDockerfile) {
      filesToPush['Dockerfile'] = dockerfileContent;
      filesToPush['.dockerignore'] = dockerignoreContent;
    }
    // SECURITY: .gitlab-ci.yml is generated + saved to project for the user
    // to copy manually — never auto-pushed (would overwrite client CI).

    let pushResult: RepoWriteResult | null = null;
    if (Object.keys(filesToPush).length > 0) {
      // Invariant : provider lié au SERVICE — résolution par service si dispo.
      const provider = serviceId
        ? await this.gitProvidersService.forService(serviceId)
        : await this.gitProvidersService.forProject(projectId);
      pushResult = await provider.writeFiles(projectId, filesToPush, serviceId);
    }

    // Build config now stored on Service model, not Project
    if (serviceId && service) {
      await this.prisma.service.update({
        where: { id: serviceId },
        data: {
          buildType: type,
          dockerfile: dockerfileContent,
        },
      });
    }

    const pipelineUrl = await this.resolveLatestPipelineUrl(projectId, serviceId);
    const serviceResult = this.buildSuccessServiceResult(
      { id: project.id, name: project.name },
      service,
      pushResult,
      pipelineUrl,
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
      where: { projectId, ...(serviceId ? { serviceEnvId: serviceId } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { webUrl: true },
    });
    return run?.webUrl ?? null;
  }
}

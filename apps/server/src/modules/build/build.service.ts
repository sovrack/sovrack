import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BuildDetectorService } from './build-detector.service';
import { BuildGeneratorService } from './build-generator.service';
import { CreateBuildConfigDto } from './dto/create-build-config.dto';

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

@Injectable()
export class BuildService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detector: BuildDetectorService,
    private readonly generator: BuildGeneratorService,
  ) {}

  async prepare(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<{
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
    gitlabCiContent: string;
  }> {
    await this.assertCanConfigureBuild(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { gitlabConfig: true },
    });

    if (!project) throw new NotFoundException('Projet non trouvé');

    // Détection du type
    const detected = await this.detector.detectProjectType(projectId);
    const type =
      project.projectType || detected.recommendedBuildType || detected.type;
    const port =
      project.buildPort ?? detected.recommendedPort ?? project.port ?? 3000;
    const startCmd =
      project.buildStartCmd ??
      detected.recommendedStartCommand ??
      'node index.js';
    const registryUrl = project.gitlabConfig?.registryUrl ?? undefined;

    // Génération des fichiers
    const dockerfileContent = this.generator.generateDockerfile(type, {
      port,
      startCmd,
    });
    const gitlabCiContent = this.generator.generateGitlabCI({
      port,
      startCmd,
      registryUrl,
    });

    // Push dans le repo GitLab
    await this.generator.pushFilesToRepo(projectId, {
      Dockerfile: dockerfileContent,
      '.gitlab-ci.yml': gitlabCiContent,
    });

    // Configuration du webhook
    await this.generator.configureWebhook(projectId);

    // Sauvegarde en base
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        projectType: type,
        dockerfileContent,
        gitlabCiContent,
      },
    });

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
      gitlabCiContent,
    };
  }

  async getTemplates(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<{ types: string[] }> {
    await this.assertCanConfigureBuild(projectId, userId, userRole);
    return { types: SUPPORTED_TYPES };
  }

  async updateBuildConfig(
    projectId: string,
    dto: CreateBuildConfigDto,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.assertCanConfigureBuild(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Projet non trouvé');

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

  async pushFiles(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.assertCanConfigureBuild(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Projet non trouvé');

    if (!project.dockerfileContent || !project.gitlabCiContent) {
      throw new Error("Les fichiers doivent être générés avant d'être poussés");
    }

    await this.generator.pushFilesToRepo(projectId, {
      Dockerfile: project.dockerfileContent,
      '.gitlab-ci.yml': project.gitlabCiContent,
    });
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
}

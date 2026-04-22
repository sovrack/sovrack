import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BuildDetectorService } from './build-detector.service';
import { BuildGeneratorService } from './build-generator.service';
import { CreateBuildConfigDto } from './dto/create-build-config.dto';

const SUPPORTED_TYPES = [
  'nodejs',
  'python',
  'php',
  'static',
  'docker',
  'ruby',
  'unknown',
];

@Injectable()
export class BuildService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detector: BuildDetectorService,
    private readonly generator: BuildGeneratorService,
  ) {}

  async prepare(projectId: string): Promise<{
    type: string;
    confidence: string;
    dockerfileContent: string;
    gitlabCiContent: string;
  }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { gitlabConfig: true },
    });

    if (!project) throw new NotFoundException('Projet non trouvé');

    // Détection du type
    const detected = await this.detector.detectProjectType(projectId);
    const type = detected.type;
    const port = project.buildPort ?? project.port ?? 3000;
    const startCmd = project.buildStartCmd ?? 'index.js';
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
      dockerfileContent,
      gitlabCiContent,
    };
  }

  getTemplates(): { types: string[] } {
    return { types: SUPPORTED_TYPES };
  }

  async updateBuildConfig(
    projectId: string,
    dto: CreateBuildConfigDto,
  ): Promise<void> {
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

  async pushFiles(projectId: string): Promise<void> {
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
}

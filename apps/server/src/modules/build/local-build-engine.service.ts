import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { PrismaService } from '../../core/database/prisma.service';
import { CryptoService } from '../../core/crypto/crypto.service';

/**
 * LocalBuildEngineService — builds Docker images directly on the VPS via Ansible.
 * No GitLab Runner required, no external registry required.
 *
 * Uses playbook: deploy-local-build.yml
 * The VPS clones the repo, runs `docker build`, and deploys with blue-green.
 */
@Injectable()
export class LocalBuildEngineService {
  private readonly logger = new Logger(LocalBuildEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
  ) {}

  async buildAndDeploy(params: {
    projectId: string;
    environmentId: string;
    branch: string;
    userId: string;
    userRole: Role;
    overrideRepoUrl?: string;
  }): Promise<{ playbookPath: string; extraVars: Record<string, unknown> }> {
    const project = await this.prisma.project.findUnique({
      where: { id: params.projectId },
      include: {
        gitlabConfig: true,
      },
    });

    if (!project) throw new BadRequestException('Projet non trouvé');

    const environment = await this.prisma.environment.findUnique({
      where: { id: params.environmentId },
      include: { server: true },
    });

    if (!environment) throw new BadRequestException('Environnement non trouvé');

    const repoUrl =
      params.overrideRepoUrl ??
      project.gitlabUrl ??
      '';

    if (!repoUrl) {
      throw new BadRequestException('URL du dépôt non configurée sur le projet');
    }

    const containerName = this.slugify(project.name);
    const imageTag = `${containerName}:${this.slugify(params.branch)}`;

    const playbookRoot = this.resolvePlaybookRoot();
    const playbookPath = join(playbookRoot, 'deploy-local-build.yml');

    if (!existsSync(playbookPath)) {
      throw new BadRequestException(
        `Playbook local build introuvable: ${playbookPath}`,
      );
    }

    let gitToken: string | undefined;
    if (project.gitlabConfig) {
      // Prefer deploy token (more scoped), fall back to admin token
      if (project.gitlabConfig.deployTokenValue) {
        try {
          gitToken = this.cryptoService.decrypt(project.gitlabConfig.deployTokenValue);
        } catch {
          gitToken = undefined;
        }
      }
      if (!gitToken && project.gitlabConfig.gitlabToken) {
        try {
          gitToken = this.cryptoService.decrypt(project.gitlabConfig.gitlabToken);
        } catch {
          gitToken = undefined;
        }
      }
    }

    const extraVars: Record<string, unknown> = {
      container_name: containerName,
      app_port: project.port ?? 3000,
      repo_url: repoUrl,
      repo_branch: params.branch,
      image_tag: imageTag,
      domain: environment.domain ?? '',
      ...(gitToken ? { git_token: gitToken } : {}),
    };

    this.logger.log(
      `Local build configuré: ${imageTag} depuis ${repoUrl}@${params.branch}`,
    );

    return { playbookPath, extraVars };
  }

  private resolvePlaybookRoot(): string {
    const configured = this.configService.get<string>('ANSIBLE_PLAYBOOKS_PATH', '').trim();
    if (configured) {
      const abs = resolve(configured);
      if (existsSync(abs)) return abs;
    }
    const fallback = resolve(process.cwd(), '../devops/ansible/playbooks');
    if (existsSync(fallback)) return fallback;
    throw new BadRequestException('Répertoire Ansible introuvable.');
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'app';
  }

  async prepareLocalBuildTmpFiles(extraVars: Record<string, unknown>): Promise<{
    tmpPath: string;
    varsPath: string;
  }> {
    const tmpPath = await mkdtemp(join(tmpdir(), 'local-build-'));
    const varsPath = join(tmpPath, 'vars.json');
    await writeFile(varsPath, JSON.stringify(extraVars, null, 2), 'utf-8');
    return { tmpPath, varsPath };
  }

  async cleanup(tmpPath: string): Promise<void> {
    await rm(tmpPath, { recursive: true, force: true });
  }
}

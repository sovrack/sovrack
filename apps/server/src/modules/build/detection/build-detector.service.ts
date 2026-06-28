import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import {
  parseJsonSafely,
  type PackageJson,
  type ParsedProjectSignals,
} from './project-detection.util';
import type { DetectResult } from './build-detection.types';
import { inferType, fallbackUnknownResult } from './build-type-inference.util';
import { RepositoryFileFetcherService } from './repository-file-fetcher.service';

export type { DetectResult } from './build-detection.types';

@Injectable()
export class BuildDetectorService {
  private readonly logger = new Logger(BuildDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly fileFetcher: RepositoryFileFetcherService,
  ) {}

  async detectProjectType(
    projectId: string,
    serviceId?: string,
  ): Promise<DetectResult> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        providerRepos: {
          include: { provider: true },
          take: 1,
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    const repo = project.providerRepos?.[0];
    if (!repo) {
      throw new NotFoundException('Aucun dépôt Git configuré');
    }

    const config = repo.provider;
    const isGitHub = config.type === GitProviderType.GITHUB;
    const adminToken = config.adminToken
      ? this.crypto.decrypt(config.adminToken)
      : null;
    const oauthToken = config.oauthAccessToken
      ? this.crypto.decrypt(config.oauthAccessToken)
      : null;
    const token = oauthToken || adminToken || '';
    const baseUrl = isGitHub
      ? config.providerUrl === 'https://github.com' ||
        config.providerUrl === 'http://github.com'
        ? 'https://api.github.com'
        : `${config.providerUrl.replace(/\/$/, '')}/api/v3`
      : config.providerUrl.replace(/\/$/, '');
    let ref = repo.defaultBranch || 'main';

    if (serviceId) {
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId },
      });
      if (!service) {
        throw new NotFoundException('Service introuvable');
      }
      if (service.branch) {
        ref = service.branch;
      }
    }

    let files: string[] = [];
    let repoId: string;
    try {
      if (isGitHub) {
        repoId = repo.repoPath ?? '';
        if (!repoId)
          throw new NotFoundException('Nom de dépôt GitHub introuvable');
        files = await this.fileFetcher.listGitHubRepositoryFiles(
          baseUrl,
          repoId,
          token,
          ref,
        );
      } else {
        repoId = this.resolveGitlabProjectId(repo);
        files = await this.fileFetcher.listGitLabRepositoryFiles(
          baseUrl,
          repoId,
          token,
        );
      }
    } catch (err) {
      this.logger.warn(
        `listRepositoryFiles failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return fallbackUnknownResult(
        isGitHub
          ? 'Unable to read repository tree from GitHub.'
          : 'Unable to read repository tree from GitLab.',
      );
    }

    const signals = await this.collectSignals({
      baseUrl,
      provider: config.type,
      token,
      ref,
      files,
      repoId,
    });

    const result = inferType(files, signals);

    if (serviceId) {
      await this.prisma.service.update({
        where: { id: serviceId },
        data: { buildType: result.type },
      });
    }

    return result;
  }

  private resolveGitlabProjectId(repo: { repoPath?: string | null }): string {
    if (!repo.repoPath)
      throw new NotFoundException('Chemin GitLab du dépôt introuvable');
    return repo.repoPath;
  }

  private async collectSignals(input: {
    baseUrl: string;
    provider: GitProviderType;
    token: string;
    ref: string;
    files: string[];
    repoId: string;
  }): Promise<ParsedProjectSignals> {
    const readCandidate = async (
      candidates: string[],
    ): Promise<string | null> => {
      const path = this.pickBestCandidate(input.files, candidates);
      if (!path) {
        return null;
      }
      return await this.fileFetcher.fetchRawFile(
        input.baseUrl,
        input.provider,
        input.repoId,
        input.token,
        path,
        input.ref,
      );
    };

    const [
      packageJsonRaw,
      requirementsTxt,
      pyprojectToml,
      composerJson,
      goMod,
      pomXml,
      buildGradle,
      dockerfile,
      dockerCompose,
    ] = await Promise.all([
      readCandidate(['package.json']),
      readCandidate(['requirements.txt']),
      readCandidate(['pyproject.toml']),
      readCandidate(['composer.json']),
      readCandidate(['go.mod']),
      readCandidate(['pom.xml']),
      readCandidate(['build.gradle', 'build.gradle.kts']),
      readCandidate(['Dockerfile', 'dockerfile', '.Dockerfile']),
      readCandidate([
        'docker-compose.yml',
        'docker-compose.yaml',
        'compose.yml',
        'compose.yaml',
      ]),
    ]);

    return {
      packageJson: parseJsonSafely<PackageJson>(packageJsonRaw),
      requirementsTxt,
      pyprojectToml,
      composerJson,
      goMod,
      pomXml,
      buildGradle,
      dockerfile,
      dockerCompose,
    };
  }

  private pickBestCandidate(
    files: string[],
    candidates: string[],
  ): string | null {
    const lowerFiles = files.map((file) => ({
      original: file,
      lower: file.toLowerCase(),
    }));
    const lowerCandidates = candidates.map((candidate) =>
      candidate.toLowerCase(),
    );

    const exactRoot = lowerFiles.find((file) =>
      lowerCandidates.includes(file.lower),
    );
    if (exactRoot) {
      return exactRoot.original;
    }

    const nested = lowerFiles
      .filter((file) =>
        lowerCandidates.some((candidate) =>
          file.lower.endsWith(`/${candidate}`),
        ),
      )
      .sort((a, b) => a.original.length - b.original.length);

    if (nested[0]) {
      return nested[0].original;
    }

    return null;
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { GitProviderType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../core/database/prisma.service';
import { CryptoService } from '../../../core/crypto/crypto.service';

type DetectConfidence = 'high' | 'medium' | 'low';

type RepoTreeItem = {
  name: string;
  type: string;
  path?: string;
};

type GitHubTreeItem = {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
};

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type ParsedProjectSignals = {
  packageJson: PackageJson | null;
  requirementsTxt: string | null;
  pyprojectToml: string | null;
  composerJson: string | null;
  goMod: string | null;
  pomXml: string | null;
  buildGradle: string | null;
  dockerfile: string | null;
  dockerCompose: string | null;
};

export type DetectResult = {
  type: string;
  confidence: DetectConfidence;
  language: string;
  framework: string;
  packageManager: string;
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasCiConfig: boolean;
  recommendedStrategy:
    | 'docker'
    | 'docker-multi-stage'
    | 'nixpacks'
    | 'static-build'
    | 'service-container';
  recommendedBuildType: string;
  recommendedStartCommand: string;
  recommendedPort: number;
  reasons: string[];
};

@Injectable()
export class BuildDetectorService {
  private readonly logger = new Logger(BuildDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly crypto: CryptoService,
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
        files = await this.listGitHubRepositoryFiles(
          baseUrl,
          repoId,
          token,
          ref,
        );
      } else {
        repoId = this.resolveGitlabProjectId(repo);
        files = await this.listGitLabRepositoryFiles(baseUrl, repoId, token);
      }
    } catch (err) {
      this.logger.warn(
        `listRepositoryFiles failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.fallbackUnknownResult(
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

    const result = this.inferType(files, signals);

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

  private async listGitLabRepositoryFiles(
    baseUrl: string,
    gitlabId: string,
    token: string,
  ): Promise<string[]> {
    const all: string[] = [];
    let page = 1;
    const perPage = 100;
    const MAX_PAGES = 200;

    while (page <= MAX_PAGES) {
      const response = await firstValueFrom(
        this.httpService.get<RepoTreeItem[]>(
          `${baseUrl}/api/v4/projects/${encodeURIComponent(String(gitlabId))}/repository/tree`,
          {
            headers: { 'PRIVATE-TOKEN': token },
            params: { recursive: true, per_page: perPage, page },
          },
        ),
      );

      const items = Array.isArray(response.data) ? response.data : [];
      if (items.length === 0) {
        break;
      }

      for (const item of items) {
        const path = item.path || item.name;
        if (path) {
          all.push(path);
        }
      }

      const headers = response.headers as Record<string, unknown>;
      const nextHeader = headers['x-next-page'];
      const nextPageHeader =
        typeof nextHeader === 'string'
          ? nextHeader
          : Array.isArray(nextHeader) && typeof nextHeader[0] === 'string'
            ? nextHeader[0]
            : '';
      const nextPage = Number(nextPageHeader);
      if (!Number.isFinite(nextPage) || nextPage <= page) {
        break;
      }
      page = nextPage;
    }

    return Array.from(new Set(all));
  }

  private async listGitHubRepositoryFiles(
    baseUrl: string,
    repoFullName: string | null,
    token: string,
    ref: string,
  ): Promise<string[]> {
    if (!repoFullName) {
      throw new NotFoundException('Nom de dépôt GitHub introuvable');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const commitRes = await firstValueFrom(
      this.httpService.get<{ sha: string }>(
        `${baseUrl}/repos/${repoFullName}/commits/${encodeURIComponent(ref)}`,
        { headers },
      ),
    );
    const commitSha = commitRes.data.sha;

    const treeRes = await firstValueFrom(
      this.httpService.get<{ tree: GitHubTreeItem[]; truncated: boolean }>(
        `${baseUrl}/repos/${repoFullName}/git/trees/${commitSha}?recursive=1`,
        { headers },
      ),
    );

    const items = Array.isArray(treeRes.data.tree) ? treeRes.data.tree : [];

    return items
      .filter((item) => item.type === 'blob')
      .map((item) => item.path);
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
      return await this.fetchRawFile(
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
      packageJson: this.parseJsonSafely<PackageJson>(packageJsonRaw),
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

  private async fetchRawFile(
    baseUrl: string,
    provider: GitProviderType,
    repoId: string,
    token: string,
    filePath: string,
    ref: string,
  ): Promise<string | null> {
    try {
      if (provider === GitProviderType.GITHUB) {
        if (!repoId) return null;
        const res = await firstValueFrom(
          this.httpService.get<{ content?: string; encoding?: string }>(
            `${baseUrl}/repos/${repoId}/contents/${encodeURIComponent(filePath)}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
              params: { ref },
            },
          ),
        );
        const { content, encoding } = res.data;
        if (!content) return null;
        if (encoding === 'base64')
          return Buffer.from(content.replace(/\n/g, ''), 'base64').toString(
            'utf-8',
          );
        return content;
      } else {
        const res = await firstValueFrom(
          this.httpService.get<string>(
            `${baseUrl}/api/v4/projects/${encodeURIComponent(repoId)}/repository/files/${encodeURIComponent(filePath)}/raw`,
            {
              headers: { 'PRIVATE-TOKEN': token },
              params: { ref },
              responseType: 'text',
            },
          ),
        );
        return typeof res.data === 'string' ? res.data : null;
      }
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status && status !== 404) {
        this.logger.warn(
          `fetchRawFile error (status=${status}): ${this.errorMessage(error)}`,
        );
      }
      return null;
    }
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

  private inferType(
    files: string[],
    signals: ParsedProjectSignals,
  ): DetectResult {
    const lowerFiles = files.map((file) => file.toLowerCase());
    const fileSet = new Set(lowerFiles);
    const reasons: string[] = [];

    const hasDockerfile = lowerFiles.some((file) =>
      file.endsWith('dockerfile'),
    );
    const hasDockerCompose = lowerFiles.some(
      (file) =>
        file.endsWith('docker-compose.yml') ||
        file.endsWith('docker-compose.yaml') ||
        file.endsWith('compose.yml') ||
        file.endsWith('compose.yaml'),
    );
    const hasCiConfig =
      fileSet.has('.gitlab-ci.yml') ||
      lowerFiles.some((file) => file.startsWith('.github/workflows/'));

    const packageManager = this.detectPackageManager(fileSet, signals);
    const packageDeps = this.mergeDependencies(signals.packageJson);
    const packageScripts = signals.packageJson?.scripts ?? {};

    if (hasDockerCompose && signals.dockerCompose) {
      if (
        this.containsAny(signals.dockerCompose, ['postgres:', 'postgresql'])
      ) {
        reasons.push('docker-compose includes PostgreSQL service');
        return this.buildResult({
          type: 'postgres-service',
          confidence: 'high',
          language: 'service',
          framework: 'postgresql',
          packageManager,
          hasDockerfile,
          hasDockerCompose,
          hasCiConfig,
          recommendedStrategy: 'service-container',
          recommendedBuildType: 'postgres-service',
          recommendedStartCommand: 'postgres',
          recommendedPort: 5432,
          reasons,
        });
      }
      if (this.containsAny(signals.dockerCompose, ['redis:', 'redis-stack'])) {
        reasons.push('docker-compose includes Redis service');
        return this.buildResult({
          type: 'redis-service',
          confidence: 'high',
          language: 'service',
          framework: 'redis',
          packageManager,
          hasDockerfile,
          hasDockerCompose,
          hasCiConfig,
          recommendedStrategy: 'service-container',
          recommendedBuildType: 'redis-service',
          recommendedStartCommand: 'redis-server',
          recommendedPort: 6379,
          reasons,
        });
      }
    }

    if (packageDeps.has('@nestjs/core') || fileSet.has('nest-cli.json')) {
      reasons.push('NestJS markers found (@nestjs/core or nest-cli.json)');
      return this.buildResult({
        type: 'nestjs',
        confidence: 'high',
        language: 'typescript',
        framework: 'nestjs',
        packageManager,
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile
          ? 'docker-multi-stage'
          : 'docker-multi-stage',
        recommendedBuildType: 'nestjs',
        recommendedStartCommand:
          packageScripts.start?.includes('node') ||
          packageScripts.start?.includes('dist/')
            ? packageScripts.start
            : 'node dist/main.js',
        recommendedPort: 3000,
        reasons,
      });
    }

    if (
      packageDeps.has('next') ||
      lowerFiles.some((file) => file.startsWith('next.config.'))
    ) {
      reasons.push('Next.js markers found (next dependency or next.config)');
      return this.buildResult({
        type: 'nextjs',
        confidence: 'high',
        language: 'typescript',
        framework: 'nextjs',
        packageManager,
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile
          ? 'docker-multi-stage'
          : 'docker-multi-stage',
        recommendedBuildType: 'nextjs',
        recommendedStartCommand:
          packageScripts.start && packageScripts.start.trim().length > 0
            ? packageScripts.start
            : 'npm run start',
        recommendedPort: 3000,
        reasons,
      });
    }

    if (packageDeps.has('react') && packageDeps.has('react-dom')) {
      reasons.push('React markers found (react + react-dom)');
      return this.buildResult({
        type: 'react',
        confidence: 'high',
        language: 'typescript',
        framework: 'react',
        packageManager,
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile ? 'docker' : 'static-build',
        recommendedBuildType: 'react',
        recommendedStartCommand: 'npm run build',
        recommendedPort: 80,
        reasons,
      });
    }

    if (fileSet.has('package.json')) {
      reasons.push('Node.js marker found (package.json)');
      return this.buildResult({
        type: 'nodejs',
        confidence: 'medium',
        language: 'javascript',
        framework: 'nodejs',
        packageManager,
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile ? 'docker' : 'docker-multi-stage',
        recommendedBuildType: 'nodejs',
        recommendedStartCommand:
          packageScripts.start && packageScripts.start.trim().length > 0
            ? packageScripts.start
            : 'node index.js',
        recommendedPort: 3000,
        reasons,
      });
    }

    if (
      signals.pyprojectToml ||
      signals.requirementsTxt ||
      fileSet.has('manage.py')
    ) {
      if (
        this.containsAny(signals.pyprojectToml, ['django']) ||
        this.containsAny(signals.requirementsTxt, ['django']) ||
        fileSet.has('manage.py')
      ) {
        reasons.push('Django markers found (manage.py or django dependency)');
        return this.buildResult({
          type: 'django',
          confidence: 'high',
          language: 'python',
          framework: 'django',
          packageManager: this.resolvePythonPackageManager(fileSet, signals),
          hasDockerfile,
          hasDockerCompose,
          hasCiConfig,
          recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
          recommendedBuildType: 'django',
          recommendedStartCommand:
            'gunicorn app.wsgi:application --bind 0.0.0.0:8000',
          recommendedPort: 8000,
          reasons,
        });
      }

      reasons.push('Python markers found (requirements.txt or pyproject.toml)');
      return this.buildResult({
        type: 'python',
        confidence: 'medium',
        language: 'python',
        framework: 'python',
        packageManager: this.resolvePythonPackageManager(fileSet, signals),
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
        recommendedBuildType: 'python',
        recommendedStartCommand: 'python app.py',
        recommendedPort: 8000,
        reasons,
      });
    }

    if (signals.composerJson || fileSet.has('artisan')) {
      if (
        this.containsAny(signals.composerJson, ['laravel/framework']) ||
        fileSet.has('artisan')
      ) {
        reasons.push('Laravel markers found (artisan or laravel/framework)');
        return this.buildResult({
          type: 'laravel',
          confidence: 'high',
          language: 'php',
          framework: 'laravel',
          packageManager: 'composer',
          hasDockerfile,
          hasDockerCompose,
          hasCiConfig,
          recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
          recommendedBuildType: 'laravel',
          recommendedStartCommand:
            'php artisan serve --host=0.0.0.0 --port=8000',
          recommendedPort: 8000,
          reasons,
        });
      }

      reasons.push('PHP markers found (composer.json)');
      return this.buildResult({
        type: 'php',
        confidence: 'medium',
        language: 'php',
        framework: 'php',
        packageManager: 'composer',
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
        recommendedBuildType: 'php',
        recommendedStartCommand: 'php -S 0.0.0.0:8080 -t public',
        recommendedPort: 8080,
        reasons,
      });
    }

    if (signals.goMod || fileSet.has('go.mod')) {
      reasons.push('Go markers found (go.mod)');
      return this.buildResult({
        type: 'go',
        confidence: 'high',
        language: 'go',
        framework: 'go',
        packageManager: 'go-modules',
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile ? 'docker' : 'docker-multi-stage',
        recommendedBuildType: 'go',
        recommendedStartCommand: './app',
        recommendedPort: 8080,
        reasons,
      });
    }

    if (signals.pomXml || signals.buildGradle) {
      const isSpringBoot =
        this.containsAny(signals.pomXml, ['spring-boot']) ||
        this.containsAny(signals.buildGradle, ['org.springframework.boot']);
      if (isSpringBoot) {
        reasons.push('Spring Boot markers found (spring-boot)');
        return this.buildResult({
          type: 'spring-boot',
          confidence: 'high',
          language: 'java',
          framework: 'spring-boot',
          packageManager: signals.pomXml ? 'maven' : 'gradle',
          hasDockerfile,
          hasDockerCompose,
          hasCiConfig,
          recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
          recommendedBuildType: 'spring-boot',
          recommendedStartCommand: 'java -jar app.jar',
          recommendedPort: 8080,
          reasons,
        });
      }

      reasons.push('Java markers found (pom.xml/build.gradle)');
      return this.buildResult({
        type: 'java',
        confidence: 'medium',
        language: 'java',
        framework: 'java',
        packageManager: signals.pomXml ? 'maven' : 'gradle',
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: hasDockerfile ? 'docker' : 'nixpacks',
        recommendedBuildType: 'java',
        recommendedStartCommand: 'java -jar app.jar',
        recommendedPort: 8080,
        reasons,
      });
    }

    if (hasDockerfile) {
      const multiStage = this.isMultiStageDockerfile(signals.dockerfile);
      reasons.push('Dockerfile found');
      return this.buildResult({
        type: 'dockerized',
        confidence: 'medium',
        language: 'container',
        framework: 'docker',
        packageManager,
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: multiStage ? 'docker-multi-stage' : 'docker',
        recommendedBuildType: 'dockerized',
        recommendedStartCommand: 'docker run <image>',
        recommendedPort: 3000,
        reasons,
      });
    }

    if (
      fileSet.has('index.html') ||
      lowerFiles.some((file) => file.endsWith('/index.html'))
    ) {
      reasons.push('Static frontend marker found (index.html)');
      return this.buildResult({
        type: 'static-frontend',
        confidence: 'medium',
        language: 'html',
        framework: 'static',
        packageManager,
        hasDockerfile,
        hasDockerCompose,
        hasCiConfig,
        recommendedStrategy: 'static-build',
        recommendedBuildType: 'static',
        recommendedStartCommand: 'serve static assets',
        recommendedPort: 80,
        reasons,
      });
    }

    reasons.push('No strong framework marker found');
    return this.fallbackUnknownResult(...reasons);
  }

  private buildResult(input: DetectResult): DetectResult {
    return input;
  }

  private fallbackUnknownResult(...reasons: string[]): DetectResult {
    return {
      type: 'unknown',
      confidence: 'low',
      language: 'unknown',
      framework: 'unknown',
      packageManager: 'unknown',
      hasDockerfile: false,
      hasDockerCompose: false,
      hasCiConfig: false,
      recommendedStrategy: 'docker',
      recommendedBuildType: 'unknown',
      recommendedStartCommand: 'node index.js',
      recommendedPort: 3000,
      reasons,
    };
  }

  private detectPackageManager(
    fileSet: Set<string>,
    signals: ParsedProjectSignals,
  ): string {
    if (fileSet.has('pnpm-lock.yaml')) return 'pnpm';
    if (fileSet.has('yarn.lock')) return 'yarn';
    if (fileSet.has('bun.lockb') || fileSet.has('bun.lock')) return 'bun';
    if (fileSet.has('package-lock.json')) return 'npm';
    if (signals.packageJson) return 'npm';
    return 'unknown';
  }

  private resolvePythonPackageManager(
    fileSet: Set<string>,
    signals: ParsedProjectSignals,
  ): string {
    if (fileSet.has('poetry.lock')) return 'poetry';
    if (fileSet.has('pipfile.lock') || fileSet.has('pipfile')) return 'pipenv';
    if (signals.pyprojectToml) return 'pip';
    if (signals.requirementsTxt) return 'pip';
    return 'unknown';
  }

  private mergeDependencies(packageJson: PackageJson | null): Set<string> {
    if (!packageJson) {
      return new Set<string>();
    }
    return new Set<string>([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ]);
  }

  private parseJsonSafely<T>(raw: string | null): T | null {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private containsAny(raw: string | null, markers: string[]): boolean {
    if (!raw) {
      return false;
    }
    const lower = raw.toLowerCase();
    return markers.some((marker) => lower.includes(marker.toLowerCase()));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isMultiStageDockerfile(raw: string | null): boolean {
    if (!raw) {
      return false;
    }
    const matches = raw.match(/^\s*from\s+/gim);
    return Boolean(matches && matches.length >= 2);
  }
}

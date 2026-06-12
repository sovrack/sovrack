import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { GitProviderType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../../core/database/prisma.service';
import { ALLOWED_PUSH_FILES } from '../../../../core/utils/file-constants';
import { GitProviderConfigService } from '../../config/git-provider-config.service';
import { GithubApiService } from './github-api.service';
import type { RepoWriteResult, GitCredentials } from '../../interfaces/source-provider.interface';

/**
 * Low-level GitHub file I/O:
 *   - readFile          → GET  /repos/{owner}/{repo}/contents/{path}?ref={ref}
 *   - writeFiles        → PUT  /repos/{owner}/{repo}/contents/{path} (upsert via sha)
 *   - resolveGitCredentials → https://x-token:{PAT}@github.com/owner/repo.git
 *
 * Owned by source-providers/github — NOT by build.
 */
@Injectable()
export class GithubFileService {
  private readonly logger = new Logger(GithubFileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly api: GithubApiService,
    private readonly gitProviderRegistry: GitProviderConfigService,
  ) {}

  async readFile(
    projectId: string,
    filePath: string,
    ref = 'HEAD',
  ): Promise<string | null> {
    const { token, apiBase, fullRepoName } = await this.resolveCredentials(projectId);
    try {
      const res = await firstValueFrom(
        this.httpService.get<{ content?: string; encoding?: string }>(
          `${apiBase}/repos/${fullRepoName}/contents/${encodeURIComponent(filePath)}`,
          { headers: this.headers(token), params: { ref } },
        ),
      );
      const { content, encoding } = res.data;
      if (!content) return null;
      if (encoding === 'base64') return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf-8');
      return content;
    } catch (err: unknown) {
      if (this.extractStatus(err) === 404) return null;
      this.throwMapped('lecture du fichier', err, `Impossible de lire ${filePath}`);
    }
  }

  async writeFiles(
    projectId: string,
    files: Record<string, string>,
    serviceId?: string,
  ): Promise<RepoWriteResult> {
    const blocked = Object.keys(files).filter(
      (f) => !ALLOWED_PUSH_FILES.has(f),
    );
    if (blocked.length > 0) {
      throw new ForbiddenException(
        `Files refused by policy: ${blocked.join(', ')}. ` +
          `Allowed: ${[...ALLOWED_PUSH_FILES].join(', ')}`,
      );
    }

    const { token, apiBase, fullRepoName, defaultBranch } = await this.resolveCredentials(projectId);
    const fileStatuses: Record<string, 'CREATED' | 'UPDATED' | 'SKIPPED'> = {};

    for (const [filePath, content] of Object.entries(files)) {
      const encodedContent = Buffer.from(content).toString('base64');
      const existingSha = await this.getFileSha(apiBase, token, fullRepoName, filePath, defaultBranch);
      const body: Record<string, unknown> = {
        message: `chore(build): upsert ${filePath} via platform`,
        content: encodedContent,
        branch: defaultBranch,
      };
      if (existingSha) body.sha = existingSha;

      try {
        await firstValueFrom(
          this.httpService.put(
            `${apiBase}/repos/${fullRepoName}/contents/${encodeURIComponent(filePath)}`,
            body,
            { headers: this.headers(token) },
          ),
        );
        fileStatuses[filePath] = existingSha ? 'UPDATED' : 'CREATED';
      } catch (err: unknown) {
        this.throwMapped(`écriture de ${filePath}`, err, `Impossible d'écrire ${filePath} sur GitHub.`);
      }
    }

    return { branch: defaultBranch, fileStatuses };
  }

  async resolveGitCredentials(projectId: string): Promise<GitCredentials> {
    const { token, fullRepoName, apiBase } = await this.resolveCredentials(projectId);
    const host = apiBase.replace('https://api.', '').replace(/^https?:\/\//, '');
    const repoUrl = `https://${host}/${fullRepoName}.git`;
    return { repoUrl, token };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  async resolveCredentials(projectId: string): Promise<{
    token: string;
    apiBase: string;
    fullRepoName: string;
    defaultBranch: string;
  }> {
    const svc = await this.prisma.service.findFirst({
      where: { projectId, providerId: { not: null } },
      select: { providerId: true, repoPath: true, branch: true },
    });
    if (!svc?.providerId) {
      throw new NotFoundException('Projet non connecté à GitHub');
    }
    const gitProviderConfig = await this.prisma.gitProviderConfig.findUnique({
      where: { id: svc.providerId },
    });
    if (!gitProviderConfig || gitProviderConfig.type !== GitProviderType.GITHUB) {
      throw new NotFoundException('Projet non connecté à GitHub');
    }
    const provider = gitProviderConfig;
    const adminToken = provider.adminToken
      ? await this.gitProviderRegistry.decryptProviderToken(provider.adminToken)
      : '';
    const oauthToken = provider.oauthAccessToken
      ? await this.gitProviderRegistry.decryptProviderToken(provider.oauthAccessToken)
      : '';
    const token = oauthToken || adminToken;
    if (!token) throw new BadRequestException('Aucun token GitHub configuré pour ce provider');
    const apiBase = this.api.buildApiBase(provider.providerUrl);

    const fullRepoName = this.extractFullRepoName(svc.repoPath ?? '');
    const defaultBranch = svc.branch ?? 'main';
    return { token, apiBase, fullRepoName, defaultBranch };
  }

  private async getFileSha(
    apiBase: string,
    token: string,
    repo: string,
    filePath: string,
    ref: string,
  ): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<{ sha?: string }>(
          `${apiBase}/repos/${repo}/contents/${encodeURIComponent(filePath)}`,
          { headers: this.headers(token), params: { ref } },
        ),
      );
      return res.data.sha ?? null;
    } catch {
      return null;
    }
  }

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private extractFullRepoName(url: string): string {
    const match = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    return match?.[1] ?? url;
  }

  private extractStatus(err: unknown): number | null {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (e.response && typeof e.response === 'object') {
        const r = e.response as Record<string, unknown>;
        if (typeof r.status === 'number') return r.status;
      }
    }
    return null;
  }

  private throwMapped(action: string, err: unknown, fallback: string): never {
    const status = this.extractStatus(err);
    this.logger.error(`[GitHub] ${action} failed (status=${String(status)})`);
    if (status === 401) throw new UnauthorizedException('Token GitHub invalide ou expiré.');
    if (status === 403) throw new ForbiddenException('Permission refusée par GitHub.');
    if (status === 404) throw new NotFoundException(`${fallback} (introuvable).`);
    if (status === 409) throw new BadRequestException(`${fallback} (conflit).`);
    throw new BadRequestException(fallback);
  }
}

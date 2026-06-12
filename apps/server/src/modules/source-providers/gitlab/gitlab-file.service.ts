import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SourceType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../core/database/prisma.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { ALLOWED_PUSH_FILES } from '../../../core/utils/file-constants';
import type { RepoWriteResult, GitCredentials } from '../interfaces/source-provider.interface';

type GitlabFilePayload = {
  branch: string;
  commit_message: string;
  content: string;
};

type GitlabFileWriteStatus = 'CREATED' | 'UPDATED';

export type GitlabRepositoryContext = {
  sourceType: SourceType;
  baseUrl: string;
  token: string;
  gitlabProjectId: string;
  branch: string;
  repositoryPath: string | null;
  serviceId?: string;
};

/**
 * Low-level GitLab file I/O:
 *   - resolveRepositoryContext   → resolve project/service → GitLab project ID + token
 *   - readFile                   → GET  /repository/files/{path}?ref={ref}
 *   - writeFiles                 → PUT/POST per file (upsert)
 *   - resolveGitCredentials      → build https://oauth2:{token}@host/path.git for VPS clone
 *
 * Owned by source-providers/gitlab — NOT by build.
 */
@Injectable()
export class GitlabFileService {
  private readonly logger = new Logger(GitlabFileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly crypto: CryptoService,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────

  async readFile(
    projectId: string,
    filePath: string,
    ref = 'HEAD',
    serviceId?: string,
  ): Promise<string | null> {
    const context = await this.resolveRepositoryContext(projectId, serviceId);
    const url =
      `${context.baseUrl}/api/v4/projects/${encodeURIComponent(String(context.gitlabProjectId))}` +
      `/repository/files/${encodeURIComponent(filePath)}`;
    try {
      const res = await firstValueFrom(
        this.httpService.get<{ content: string; encoding: string }>(url, {
          headers: { 'PRIVATE-TOKEN': context.token },
          params: { ref },
        }),
      );
      const { content, encoding } = res.data;
      if (encoding === 'base64') {
        return Buffer.from(content, 'base64').toString('utf-8');
      }
      return content;
    } catch (err: unknown) {
      if (this.extractHttpStatus(err) === 404) return null;
      this.throwGitlabMappedError('lecture du fichier', err, `Impossible de lire ${filePath}`);
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
      this.logger.warn(
        `writeFiles refused non-whitelisted files: ${blocked.join(', ')} (project=${projectId})`,
      );
      throw new ForbiddenException(
        `Files refused by policy: ${blocked.join(', ')}. ` +
          `Allowed: ${[...ALLOWED_PUSH_FILES].join(', ')}`,
      );
    }

    const context = await this.resolveRepositoryContext(projectId, serviceId);
    const projectMeta = await this.ensureGitlabProjectReachable(context);
    await this.ensureBranchExists(context, projectMeta.defaultBranch);

    const fileStatuses: Record<string, 'CREATED' | 'UPDATED' | 'SKIPPED'> = {};
    for (const [filePath, content] of Object.entries(files)) {
      fileStatuses[filePath] = await this.upsertRepoFile(context, filePath, content);
    }

    return { branch: context.branch, fileStatuses };
  }

  async resolveGitCredentials(projectId: string, serviceId?: string): Promise<GitCredentials> {
    const context = await this.resolveRepositoryContext(projectId, serviceId);
    const host = context.baseUrl.replace(/^https?:\/\//, '');
    // Provider-agnostic clone identity: the PATH only. Never fall back to the
    // numeric project ID — GitLab cannot clone "https://host/<id>.git".
    const repoPath = context.repositoryPath?.replace(/^\/+|\/+$/g, '');
    if (!repoPath) {
      throw new BadRequestException(
        'Chemin du dépôt GitLab introuvable (path_with_namespace). ' +
          'Reconnectez la source du projet pour résoudre ce problème.',
      );
    }
    const repoUrl = `https://${host}/${repoPath}.git`;
    return { repoUrl, token: context.token };
  }

  // ─── Context resolution ───────────────────────────────────────────────────

  async resolveRepositoryContext(
    projectId: string,
    serviceId?: string,
  ): Promise<GitlabRepositoryContext> {
    const svc = await this.prisma.service.findFirst({
      where: { projectId, providerId: { not: null } },
    });
    if (!svc?.providerId) throw new BadRequestException('Configuration GitLab manquante');

    const gitProviderConfig = await this.prisma.gitProviderConfig.findUnique({
      where: { id: svc.providerId },
    });
    if (!gitProviderConfig) throw new BadRequestException('Configuration GitLab manquante');

    const config: any = {
      ...gitProviderConfig,
      projectId,
      providerUrl: gitProviderConfig.providerUrl,
      providerToken: gitProviderConfig.adminToken || gitProviderConfig.oauthAccessToken || '',
      sourceType: svc.sourceType,
      defaultBranch: svc.branch,
      externalId: null,
      repoPathNamespace: null,
      externalGroupId: null,
      deployTokenUsername: null,
      deployTokenValue: null,
      webhookSecret: null,
      registryUrl: null,
      providerId: gitProviderConfig.id,
    };

    if (config.sourceType === SourceType.GIT && !serviceId) {
      // serviceId is only needed for multi-repo setups; for single repos it's optional
    }

    const service = serviceId
      ? await this.prisma.service.findUnique({
          where: { id: serviceId },
          select: { id: true, branch: true, repoPath: true, providerId: true },
        })
      : null;

    if (serviceId && !service) throw new NotFoundException('Service introuvable');

    let gitlabProjectId: string | null = null;
    let branch = 'main';
    let repositoryPath: string | null = null;

    branch = service?.branch?.trim() || config.defaultBranch?.trim() || 'main';
    repositoryPath = svc.repoPath ?? null;

    if (!repositoryPath) {
      const repoLink = await this.prisma.gitProviderRepo.findFirst({
        where: { providerId: config.providerId },
        select: { repoPath: true },
      });
      repositoryPath = repoLink?.repoPath ?? null;
    }

    gitlabProjectId = repositoryPath;

    if (!gitlabProjectId) throw new BadRequestException('Chemin GitLab introuvable pour ce projet.');

    const token = this.crypto.decrypt(config.providerToken).trim();
    if (!token)
      throw new UnauthorizedException('Token GitLab invalide ou manquant.');

    const baseUrl = config.providerUrl.replace(/\/$/, '');

    // Self-healing backfill: older projects stored only the numeric ID. Fetch the
    // real path_with_namespace from the GitLab API once and persist it, so the
    // clone URL never falls back to the (unclonable) numeric ID again.
    if (!repositoryPath && gitlabProjectId) {
      repositoryPath = await this.backfillPathNamespace(
        config.id,
        baseUrl,
        token,
        gitlabProjectId,
        service?.id ?? null,
      );
    }

    return {
      sourceType: config.sourceType,
      baseUrl,
      token,
      gitlabProjectId,
      branch,
      repositoryPath,
      serviceId: service?.id,
    };
  }

  /**
   * Fetches `path_with_namespace` from the GitLab API for a project that was
   * stored without it, and persists it on the AppProviderLink (+ service when
   * present) so subsequent clones use the path. Returns null on failure (the
   * caller then surfaces a clear error instead of building a broken URL).
   */
  private async backfillPathNamespace(
    configId: string,
    baseUrl: string,
    token: string,
    gitlabProjectId: string,
    serviceId: string | null,
  ): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<Record<string, unknown>>(
          `${baseUrl}/api/v4/projects/${encodeURIComponent(String(gitlabProjectId))}`,
          { headers: { 'PRIVATE-TOKEN': token } },
        ),
      );
      const path = this.pickString(response.data, 'path_with_namespace');
      if (!path) return null;
      if (serviceId) {
        await this.prisma.service.update({
          where: { id: serviceId },
          data: { repoPath: path },
        });
      }
      this.logger.log(
        `Backfilled repoPathNamespace="${path}" for GitLab project ${String(gitlabProjectId)}`,
      );
      return path;
    } catch (err) {
      this.logger.warn(
        `Failed to backfill path_with_namespace for project ${String(gitlabProjectId)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private async ensureGitlabProjectReachable(
    context: GitlabRepositoryContext,
  ): Promise<{ defaultBranch: string | null }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<Record<string, unknown>>(
          `${context.baseUrl}/api/v4/projects/${encodeURIComponent(String(context.gitlabProjectId))}`,
          { headers: { 'PRIVATE-TOKEN': context.token } },
        ),
      );
      const defaultBranch = this.pickString(response.data, 'default_branch');
      this.assertWritePermission(response.data);
      return { defaultBranch };
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      this.throwGitlabMappedError(
        'vérification du projet GitLab',
        err,
        'Impossible de vérifier le projet GitLab cible.',
      );
    }
  }

  private assertWritePermission(projectData: Record<string, unknown>): void {
    const permissionsRaw = projectData.permissions;
    if (!permissionsRaw || typeof permissionsRaw !== 'object') return;
    const permissions = permissionsRaw as Record<string, unknown>;
    const projectAccess = this.pickNestedNumber(permissions, ['project_access', 'access_level']);
    const groupAccess = this.pickNestedNumber(permissions, ['group_access', 'access_level']);
    if (projectAccess === null && groupAccess === null) return;
    const effectiveAccess = Math.max(projectAccess ?? 0, groupAccess ?? 0);
    if (effectiveAccess < 30) {
      throw new ForbiddenException(
        'Le token GitLab n\'a pas les droits write_repository (Developer minimum).',
      );
    }
  }

  private async ensureBranchExists(
    context: GitlabRepositoryContext,
    defaultBranch: string | null,
  ): Promise<void> {
    const branchUrl =
      `${context.baseUrl}/api/v4/projects/${encodeURIComponent(String(context.gitlabProjectId))}/repository/branches`;
    const headers = { 'PRIVATE-TOKEN': context.token };
    try {
      await firstValueFrom(
        this.httpService.get(`${branchUrl}/${encodeURIComponent(context.branch)}`, { headers }),
      );
      return;
    } catch (err: unknown) {
      if (this.extractHttpStatus(err) !== 404) {
        this.throwGitlabMappedError('vérification de la branche', err, 'Impossible de vérifier la branche.');
      }
    }
    const safeRef = defaultBranch?.trim() || null;
    if (!safeRef || safeRef === context.branch) {
      throw new NotFoundException(
        `Branche "${context.branch}" introuvable sur GitLab et ne peut pas être créée automatiquement.`,
      );
    }
    try {
      await firstValueFrom(
        this.httpService.post(branchUrl, { branch: context.branch, ref: safeRef }, { headers }),
      );
    } catch (err: unknown) {
      if (this.extractHttpStatus(err) === 409) return;
      this.throwGitlabMappedError(
        `création de la branche "${context.branch}"`,
        err,
        `Branche "${context.branch}" introuvable et création automatique échouée.`,
      );
    }
  }

  private async upsertRepoFile(
    context: GitlabRepositoryContext,
    filePath: string,
    content: string,
  ): Promise<'CREATED' | 'UPDATED'> {
    const fileApiUrl =
      `${context.baseUrl}/api/v4/projects/${encodeURIComponent(String(context.gitlabProjectId))}/repository/files/` +
      `${encodeURIComponent(filePath)}`;
    const headers = { 'PRIVATE-TOKEN': context.token };
    const payload: GitlabFilePayload = {
      branch: context.branch,
      commit_message: `chore(build): upsert ${filePath} via platform`,
      content,
    };
    const exists = await this.fileExistsInRepo(fileApiUrl, headers, context.branch);
    return this.writeRepoFile(fileApiUrl, headers, payload, filePath, exists ? 'update' : 'create');
  }

  private async writeRepoFile(
    fileApiUrl: string,
    headers: Record<string, string>,
    payload: GitlabFilePayload,
    filePath: string,
    preferredAction: 'create' | 'update',
  ): Promise<'CREATED' | 'UPDATED'> {
    const sequence: Array<'create' | 'update'> =
      preferredAction === 'create' ? ['create', 'update'] : ['update', 'create'];
    let lastError: unknown = null;
    for (const [index, action] of sequence.entries()) {
      try {
        if (action === 'create') {
          await firstValueFrom(this.httpService.post(fileApiUrl, payload, { headers }));
          return 'CREATED';
        }
        await firstValueFrom(this.httpService.put(fileApiUrl, payload, { headers }));
        return 'UPDATED';
      } catch (err: unknown) {
        lastError = err;
        if (index === 0 && this.shouldTryAlternate(err, action)) continue;
        this.throwGitlabMappedError(`mise à jour de ${filePath}`, err, `Échec GitLab pour ${filePath}.`);
      }
    }
    this.throwGitlabMappedError(`mise à jour de ${filePath}`, lastError, `Échec GitLab pour ${filePath}.`);
  }

  private shouldTryAlternate(err: unknown, action: 'create' | 'update'): boolean {
    const status = this.extractHttpStatus(err);
    const msg = this.extractGitlabErrorMessage(err).toLowerCase();
    if (action === 'create') return status === 409 || msg.includes('already exists') || msg.includes('has already been taken');
    return status === 404 || msg.includes('does not exist') || msg.includes('not found');
  }

  private async fileExistsInRepo(url: string, headers: Record<string, string>, branch: string): Promise<boolean> {
    try {
      await firstValueFrom(this.httpService.get(url, { headers, params: { ref: branch } }));
      return true;
    } catch (err: unknown) {
      if (this.extractHttpStatus(err) === 404) return false;
      this.throwGitlabMappedError('vérification du fichier', err, 'Impossible de vérifier le fichier.');
    }
  }

  // ─── Error helpers ────────────────────────────────────────────────────────

  extractHttpStatus(err: unknown): number | null {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (e.response && typeof e.response === 'object') {
        const resp = e.response as Record<string, unknown>;
        if (typeof resp.status === 'number') return resp.status;
      }
      if (typeof e.status === 'number') return e.status;
    }
    return null;
  }

  private extractErrorBody(err: unknown): unknown {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (e.response && typeof e.response === 'object') {
        const resp = e.response as Record<string, unknown>;
        if ('data' in resp) return resp.data;
      }
    }
    return null;
  }

  extractGitlabErrorMessage(err: unknown): string {
    return this.parseGitlabError(this.extractErrorBody(err));
  }

  private parseGitlabError(body: unknown): string {
    if (typeof body === 'string') return body.slice(0, 300);
    if (Array.isArray(body)) return body.filter((i): i is string => typeof i === 'string').join(', ');
    if (body && typeof body === 'object') {
      const p = body as Record<string, unknown>;
      if (typeof p.message === 'string' && p.message.trim()) return p.message;
      if (Array.isArray(p.message)) return (p.message as unknown[]).filter((i): i is string => typeof i === 'string').join(', ');
      if (typeof p.error === 'string' && p.error.trim()) return p.error;
    }
    return 'Erreur GitLab inconnue.';
  }

  throwGitlabMappedError(action: string, error: unknown, fallback: string): never {
    const status = this.extractHttpStatus(error);
    const body = this.extractErrorBody(error);
    const msg = this.parseGitlabError(body);
    this.logger.error(`[GitLab] ${action} failed (status=${String(status)}): ${JSON.stringify(body)}`);
    if (status === 401) throw new UnauthorizedException('Token GitLab invalide ou expiré.');
    if (status === 403) throw new ForbiddenException('Permission refusée par GitLab. Vérifiez les droits du token.');
    if (status === 404) throw new NotFoundException(msg || `${fallback} (ressource introuvable).`);
    if (status === 409) throw new ConflictException(msg || `${fallback} (conflit GitLab).`);
    if (status === 422) {
      if (msg.toLowerCase().includes('invalid url')) throw new UnprocessableEntityException(`${fallback} GitLab a refusé l'URL.`);
      throw new UnprocessableEntityException(msg || `${fallback} (payload invalide).`);
    }
    throw new BadRequestException(msg || `${fallback} (erreur inattendue).`);
  }

  private pickString(obj: Record<string, unknown>, key: string): string | null {
    const v = obj[key];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  }

  private pickNestedNumber(obj: Record<string, unknown>, [first, second]: [string, string]): number | null {
    const l1 = obj[first];
    if (!l1 || typeof l1 !== 'object') return null;
    const v = (l1 as Record<string, unknown>)[second];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
}

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SourceType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { ALLOWED_PUSH_FILES } from '../../../../shared/utils/file-constants';
import { normalizeRepoPath } from '../../../../shared/utils/repo-path.util';
import type {
  RepoWriteResult,
  GitCredentials,
} from '../../contracts/git-provider.contract';
import type { GitlabResolvedConfig } from './gitlab.types';
import {
  extractHttpStatus,
  pickNestedNumber,
  pickString,
  shouldTryAlternate,
  throwGitlabMappedError,
} from './gitlab-error-mapper.util';

type GitlabFilePayload = {
  branch: string;
  commit_message: string;
  content: string;
};

export type GitlabRepositoryContext = {
  sourceType: SourceType;
  baseUrl: string;
  token: string;
  gitlabProjectId: string;
  branch: string;
  repositoryPath: string | null;
  serviceId?: string;
};

/** Low-level GitLab file I/O (source-providers/gitlab). */
@Injectable()
export class GitlabFileService {
  private readonly logger = new Logger(GitlabFileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly crypto: CryptoService,
  ) {}

  /** @internal delegate – kept for GitlabWebhookConfiguratorService compatibility */
  extractHttpStatus(err: unknown): number | null {
    return extractHttpStatus(err);
  }

  /** @internal delegate – kept for GitlabWebhookConfiguratorService compatibility */
  throwGitlabMappedError(
    context: string,
    err: unknown,
    fallback: string,
  ): never {
    return throwGitlabMappedError(context, err, fallback);
  }

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
      if (extractHttpStatus(err) === 404) return null;
      throwGitlabMappedError(
        'lecture du fichier',
        err,
        `Impossible de lire ${filePath}`,
      );
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
      fileStatuses[filePath] = await this.upsertRepoFile(
        context,
        filePath,
        content,
      );
    }

    return { branch: context.branch, fileStatuses };
  }

  async resolveGitCredentials(
    projectId: string,
    serviceId?: string,
  ): Promise<GitCredentials> {
    const context = await this.resolveRepositoryContext(projectId, serviceId);
    const host = context.baseUrl.replace(/^https?:\/\//, '');
    // Provider-agnostic clone identity: the PATH only. Never fall back to the
    // numeric project ID — GitLab cannot clone "https://host/<id>.git".
    const repoPath = context.repositoryPath
      ? normalizeRepoPath(context.repositoryPath)
      : undefined;
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
    this.logger.debug(
      `[DEBUG resolveRepositoryContext] projectId=${projectId}, serviceId=${serviceId}`,
    );
    // Use serviceId to target the exact repository (fixes bug where any repo
    // in a multi-repo project could be hit).
    const svc = serviceId
      ? await this.prisma.service.findFirst({
          where: { id: serviceId, projectId },
        })
      : await this.prisma.service.findFirst({
          where: { projectId, providerId: { not: null } },
        });
    this.logger.debug(
      `[DEBUG resolveRepositoryContext] Resolved service: id=${svc?.id}, name=${svc?.name}, repoPath=${svc?.repoPath}`,
    );
    if (!svc?.providerId)
      throw new BadRequestException('Configuration GitLab manquante');

    const gitProviderConfig = await this.prisma.gitProviderConfig.findUnique({
      where: { id: svc.providerId },
    });
    if (!gitProviderConfig)
      throw new BadRequestException('Configuration GitLab manquante');

    const config: GitlabResolvedConfig = {
      ...gitProviderConfig,
      projectId,
      providerUrl: gitProviderConfig.providerUrl,
      providerToken:
        gitProviderConfig.adminToken ||
        gitProviderConfig.oauthAccessToken ||
        '',
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

    const service = serviceId
      ? await this.prisma.service.findUnique({
          where: { id: serviceId },
          select: { id: true, branch: true, repoPath: true, providerId: true },
        })
      : null;

    if (serviceId && !service)
      throw new NotFoundException('Service introuvable');

    let gitlabProjectId: string | null = null;
    let branch = 'main';
    let repositoryPath: string | null = null;

    branch = service?.branch?.trim() || config.defaultBranch?.trim() || 'main';
    repositoryPath = svc.repoPath ?? null;
    this.logger.debug(
      `[DEBUG resolveRepositoryContext] Initial repositoryPath from svc.repoPath: ${repositoryPath}`,
    );

    if (!repositoryPath) {
      this.logger.debug(
        `[DEBUG resolveRepositoryContext] repositoryPath is null, using fallback gitProviderRepo.findFirst with providerId=${config.providerId}`,
      );
      const repoLink = await this.prisma.gitProviderRepo.findFirst({
        where: { providerId: config.providerId ?? undefined },
        select: { repoPath: true },
      });
      repositoryPath = repoLink?.repoPath ?? null;
      this.logger.debug(
        `[DEBUG resolveRepositoryContext] Fallback repositoryPath: ${repositoryPath}`,
      );
    }

    gitlabProjectId = repositoryPath;

    if (!gitlabProjectId)
      throw new BadRequestException(
        'Chemin GitLab introuvable pour ce projet.',
      );

    const token = this.crypto.decrypt(config.providerToken).trim();
    if (!token)
      throw new UnauthorizedException('Token GitLab invalide ou manquant.');

    const baseUrl = config.providerUrl.replace(/\/$/, '');

    // Backfill numeric-only IDs with real path_with_namespace.
    if (!repositoryPath && gitlabProjectId) {
      repositoryPath = await this.backfillPathNamespace(
        config.id ?? '',
        baseUrl,
        token,
        gitlabProjectId,
        service?.id ?? null,
      );
    }

    return {
      sourceType: config.sourceType ?? SourceType.GIT,
      baseUrl,
      token,
      gitlabProjectId,
      branch,
      repositoryPath,
      serviceId: service?.id,
    };
  }

  /** Backfill path_with_namespace for projects stored with numeric IDs only. */
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
      const path = pickString(response.data, 'path_with_namespace');
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
      const defaultBranch = pickString(response.data, 'default_branch');
      this.assertWritePermission(response.data);
      return { defaultBranch };
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      throwGitlabMappedError(
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
    const projectAccess = pickNestedNumber(permissions, [
      'project_access',
      'access_level',
    ]);
    const groupAccess = pickNestedNumber(permissions, [
      'group_access',
      'access_level',
    ]);
    if (projectAccess === null && groupAccess === null) return;
    const effectiveAccess = Math.max(projectAccess ?? 0, groupAccess ?? 0);
    if (effectiveAccess < 30) {
      throw new ForbiddenException(
        "Le token GitLab n'a pas les droits write_repository (Developer minimum).",
      );
    }
  }

  private async ensureBranchExists(
    context: GitlabRepositoryContext,
    defaultBranch: string | null,
  ): Promise<void> {
    const branchUrl = `${context.baseUrl}/api/v4/projects/${encodeURIComponent(String(context.gitlabProjectId))}/repository/branches`;
    const headers = { 'PRIVATE-TOKEN': context.token };
    try {
      await firstValueFrom(
        this.httpService.get(
          `${branchUrl}/${encodeURIComponent(context.branch)}`,
          { headers },
        ),
      );
      return;
    } catch (err: unknown) {
      if (extractHttpStatus(err) !== 404) {
        throwGitlabMappedError(
          'vérification de la branche',
          err,
          'Impossible de vérifier la branche.',
        );
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
        this.httpService.post(
          branchUrl,
          { branch: context.branch, ref: safeRef },
          { headers },
        ),
      );
    } catch (err: unknown) {
      if (extractHttpStatus(err) === 409) return;
      throwGitlabMappedError(
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
    const exists = await this.fileExistsInRepo(
      fileApiUrl,
      headers,
      context.branch,
    );
    return this.writeRepoFile(
      fileApiUrl,
      headers,
      payload,
      filePath,
      exists ? 'update' : 'create',
    );
  }

  private async writeRepoFile(
    fileApiUrl: string,
    headers: Record<string, string>,
    payload: GitlabFilePayload,
    filePath: string,
    preferredAction: 'create' | 'update',
  ): Promise<'CREATED' | 'UPDATED'> {
    const sequence: Array<'create' | 'update'> =
      preferredAction === 'create'
        ? ['create', 'update']
        : ['update', 'create'];
    let lastError: unknown = null;
    for (const [index, action] of sequence.entries()) {
      try {
        if (action === 'create') {
          await firstValueFrom(
            this.httpService.post(fileApiUrl, payload, { headers }),
          );
          return 'CREATED';
        }
        await firstValueFrom(
          this.httpService.put(fileApiUrl, payload, { headers }),
        );
        return 'UPDATED';
      } catch (err: unknown) {
        lastError = err;
        if (index === 0 && shouldTryAlternate(err, action)) continue;
        throwGitlabMappedError(
          `mise à jour de ${filePath}`,
          err,
          `Échec GitLab pour ${filePath}.`,
        );
      }
    }
    throwGitlabMappedError(
      `mise à jour de ${filePath}`,
      lastError,
      `Échec GitLab pour ${filePath}.`,
    );
  }

  private async fileExistsInRepo(
    url: string,
    headers: Record<string, string>,
    branch: string,
  ): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(url, { headers, params: { ref: branch } }),
      );
      return true;
    } catch (err: unknown) {
      if (extractHttpStatus(err) === 404) return false;
      throwGitlabMappedError(
        'vérification du fichier',
        err,
        'Impossible de vérifier le fichier.',
      );
    }
  }
}

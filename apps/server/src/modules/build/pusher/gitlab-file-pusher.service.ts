import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { GitlabSourceType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../core/database/prisma.service';
import { GitlabCryptoService } from '../../git-providers/gitlab/gitlab-crypto.service';

type GitlabFilePayload = {
  branch: string;
  commit_message: string;
  content: string;
};

type GitlabFileWriteStatus = 'CREATED' | 'UPDATED';

export type GitlabRepositoryContext = {
  sourceType: GitlabSourceType;
  baseUrl: string;
  token: string;
  gitlabProjectId: bigint;
  branch: string;
  repositoryPath: string | null;
  serviceId?: string;
};

type GitlabProjectMeta = {
  defaultBranch: string | null;
};

export type BuildRepoPushResult = {
  branch: string;
  gitlabProjectId: string;
  repositoryPath: string | null;
  fileStatuses: Record<string, GitlabFileWriteStatus>;
};

@Injectable()
export class GitlabFilePusherService {
  private readonly logger = new Logger(GitlabFilePusherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly crypto: GitlabCryptoService,
  ) {}




  async pushFilesToRepo(
    projectId: string,
    files: Record<string, string>,
    serviceId?: string,
  ): Promise<BuildRepoPushResult> {
    const context = await this.resolveRepositoryContext(projectId, serviceId);
    const projectMeta = await this.ensureGitlabProjectReachable(context);
    await this.ensureBranchExists(context, projectMeta.defaultBranch);

    const fileStatuses: Record<string, GitlabFileWriteStatus> = {};
    for (const [filePath, content] of Object.entries(files)) {
      fileStatuses[filePath] = await this.upsertRepoFile(
        context,
        filePath,
        content,
      );
    }

    return {
      branch: context.branch,
      gitlabProjectId: String(context.gitlabProjectId),
      repositoryPath: context.repositoryPath,
      fileStatuses,
    };
  }

  async resolveRepositoryContext(
    projectId: string,
    serviceId?: string,
  ): Promise<GitlabRepositoryContext> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { gitlabConfig: true },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
    if (!project.gitlabConfig) {
      throw new BadRequestException('Configuration GitLab manquante');
    }

    const config = project.gitlabConfig;
    const sourceType = config.sourceType;

    if (sourceType === GitlabSourceType.GROUP && !serviceId) {
      throw new BadRequestException(
        'serviceId est requis pour préparer un projet en mode GROUP.',
      );
    }

    const service = serviceId
      ? await this.prisma.projectService.findFirst({
          where: { id: serviceId, projectId },
          select: {
            id: true,
            gitlabProjectId: true,
            repositoryPath: true,
            defaultBranch: true,
          },
        })
      : null;

    if (serviceId && !service) {
      throw new NotFoundException('Service introuvable');
    }

    let gitlabProjectId: bigint | null = null;
    let branch = 'main';
    let repositoryPath: string | null = null;

    if (sourceType === GitlabSourceType.GROUP) {
      if (!service) {
        throw new BadRequestException(
          'Le service sélectionné est requis pour le mode GROUP.',
        );
      }

      gitlabProjectId = service.gitlabProjectId;
      branch = service.defaultBranch?.trim() || 'main';
      repositoryPath = service.repositoryPath;

      if (!gitlabProjectId) {
        throw new BadRequestException(
          'GitLab project ID manquant sur ce service. Mettez à jour la configuration du service.',
        );
      }
    } else {
      gitlabProjectId =
        service?.gitlabProjectId ?? config.gitlabId ?? project.gitlabId ?? null;
      branch =
        service?.defaultBranch?.trim() ||
        config.defaultBranch?.trim() ||
        project.branch ||
        'main';
      repositoryPath = service?.repositoryPath ?? null;
    }

    if (!gitlabProjectId) {
      throw new BadRequestException('ID GitLab introuvable pour ce projet.');
    }

    const token = this.crypto.decryptConfigToken(config.gitlabToken).trim();
    if (!token) {
      throw new UnauthorizedException(
        'Token GitLab invalide ou manquant dans la configuration du projet.',
      );
    }

    return {
      sourceType,
      baseUrl: config.gitlabUrl.replace(/\/$/, ''),
      token,
      gitlabProjectId,
      branch,
      repositoryPath,
      serviceId: service?.id,
    };
  }

  private async ensureGitlabProjectReachable(
    context: GitlabRepositoryContext,
  ): Promise<GitlabProjectMeta> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<Record<string, unknown>>(
          `${context.baseUrl}/api/v4/projects/${encodeURIComponent(String(context.gitlabProjectId))}`,
          {
            headers: { 'PRIVATE-TOKEN': context.token },
          },
        ),
      );

      const data = response.data;
      const defaultBranch = this.pickString(data, 'default_branch');
      this.assertWritePermission(data);
      return { defaultBranch };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.throwGitlabMappedError(
        'vérification du projet GitLab',
        error,
        'Impossible de vérifier le projet GitLab cible.',
      );
    }
  }

  private assertWritePermission(projectData: Record<string, unknown>): void {
    const permissionsRaw = projectData.permissions;
    if (!permissionsRaw || typeof permissionsRaw !== 'object') {
      return;
    }

    const permissions = permissionsRaw as Record<string, unknown>;
    const projectAccess = this.pickNestedNumber(permissions, [
      'project_access',
      'access_level',
    ]);
    const groupAccess = this.pickNestedNumber(permissions, [
      'group_access',
      'access_level',
    ]);

    if (projectAccess === null && groupAccess === null) {
      return;
    }

    const effectiveAccess = Math.max(projectAccess ?? 0, groupAccess ?? 0);
    if (effectiveAccess < 30) {
      throw new ForbiddenException(
        'Le token GitLab n’a pas les droits write_repository (Developer minimum) sur ce projet.',
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
          {
            headers,
          },
        ),
      );
      return;
    } catch (error: unknown) {
      const status = this.extractHttpStatus(error);
      if (status !== 404) {
        this.throwGitlabMappedError(
          'vérification de la branche GitLab',
          error,
          'Impossible de vérifier la branche GitLab.',
        );
      }
    }

    const safeRef = defaultBranch?.trim() || null;
    if (!safeRef || safeRef === context.branch) {
      throw new NotFoundException(
        `La branche "${context.branch}" est introuvable sur GitLab et ne peut pas être créée automatiquement.`,
      );
    }

    this.logger.warn(
      `GitLab branch "${context.branch}" not found for project ${String(context.gitlabProjectId)}. Creating from "${safeRef}".`,
    );

    try {
      await firstValueFrom(
        this.httpService.post(
          branchUrl,
          { branch: context.branch, ref: safeRef },
          { headers },
        ),
      );
      this.logger.log(
        `GitLab branch "${context.branch}" created from "${safeRef}".`,
      );
    } catch (error: unknown) {
      const status = this.extractHttpStatus(error);
      if (status === 409) {
        return;
      }

      this.throwGitlabMappedError(
        `création de la branche "${context.branch}"`,
        error,
        `La branche "${context.branch}" n’existe pas et sa création automatique a échoué.`,
      );
    }
  }

  private async upsertRepoFile(
    context: GitlabRepositoryContext,
    filePath: string,
    content: string,
  ): Promise<GitlabFileWriteStatus> {
    const fileApiUrl =
      `${context.baseUrl}/api/v4/projects/${encodeURIComponent(String(context.gitlabProjectId))}/repository/files/` +
      `${encodeURIComponent(filePath)}`;
    const headers = { 'PRIVATE-TOKEN': context.token };
    const payload: GitlabFilePayload = {
      branch: context.branch,
      commit_message: `chore(build): upsert ${filePath} via Vaytek platform`,
      content,
    };

    const exists = await this.fileExistsInRepo(fileApiUrl, headers, context);

    return await this.writeRepoFile(
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
  ): Promise<GitlabFileWriteStatus> {
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
      } catch (error: unknown) {
        lastError = error;
        if (index === 0 && this.shouldTryAlternateWriteMode(error, action)) {
          continue;
        }

        this.throwGitlabMappedError(
          `mise à jour du fichier ${filePath}`,
          error,
          `Échec de la mise à jour GitLab pour ${filePath}.`,
        );
      }
    }

    this.throwGitlabMappedError(
      `mise à jour du fichier ${filePath}`,
      lastError,
      `Échec de la mise à jour GitLab pour ${filePath}.`,
    );
  }

  private shouldTryAlternateWriteMode(
    error: unknown,
    attemptedAction: 'create' | 'update',
  ): boolean {
    const status = this.extractHttpStatus(error);
    const details = this.extractGitlabErrorMessage(error).toLowerCase();

    if (attemptedAction === 'create') {
      return (
        status === 409 ||
        details.includes('already exists') ||
        details.includes('has already been taken')
      );
    }

    return (
      status === 404 ||
      details.includes('does not exist') ||
      details.includes('not found') ||
      details.includes('no such file')
    );
  }

  private async fileExistsInRepo(
    fileApiUrl: string,
    headers: Record<string, string>,
    context: GitlabRepositoryContext,
  ): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(fileApiUrl, {
          headers,
          params: { ref: context.branch },
        }),
      );
      return true;
    } catch (error: unknown) {
      const status = this.extractHttpStatus(error);
      if (status === 404) {
        return false;
      }

      this.throwGitlabMappedError(
        'vérification de l’existence du fichier',
        error,
        'Impossible de vérifier l’état du fichier sur GitLab.',
      );
    }
  }

  extractHttpStatus(err: unknown): number | null {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (e.response && typeof e.response === 'object') {
        const resp = e.response as Record<string, unknown>;
        if (typeof resp.status === 'number') {
          return resp.status;
        }
      }
      if (typeof e.status === 'number') {
        return e.status;
      }
    }
    return null;
  }

  private extractErrorBody(err: unknown): unknown {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (e.response && typeof e.response === 'object') {
        const resp = e.response as Record<string, unknown>;
        if ('data' in resp) {
          return resp.data;
        }
      }
    }
    return null;
  }

  extractGitlabErrorMessage(err: unknown): string {
    return this.parseGitlabError(this.extractErrorBody(err));
  }

  private parseGitlabError(body: unknown): string {
    if (typeof body === 'string') {
      return body.slice(0, 300);
    }
    if (Array.isArray(body)) {
      return body
        .map((item) => (typeof item === 'string' ? item : ''))
        .filter(Boolean)
        .join(', ');
    }
    if (body && typeof body === 'object') {
      const payload = body as Record<string, unknown>;
      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
      if (Array.isArray(payload.message)) {
        return payload.message
          .filter((item): item is string => typeof item === 'string')
          .join(', ');
      }
      if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
    }
    return 'Erreur GitLab inconnue.';
  }

  private formatErrorBody(body: unknown): string {
    if (typeof body === 'string') {
      return body;
    }
    if (body === null || body === undefined) {
      return '';
    }
    try {
      return JSON.stringify(body);
    } catch {
      return '[unserializable-error-body]';
    }
  }

  throwGitlabMappedError(
    action: string,
    error: unknown,
    fallbackMessage: string,
  ): never {
    const status = this.extractHttpStatus(error);
    const body = this.extractErrorBody(error);
    const parsedMessage = this.parseGitlabError(body);
    const normalizedMessage = parsedMessage.toLowerCase();

    this.logger.error(
      `[GitLab] ${action} failed (status=${String(status)}): ${this.formatErrorBody(body)}`,
    );

    if (status === 401) {
      throw new UnauthorizedException(
        'Token GitLab invalide ou expiré. Vérifiez la configuration du provider.',
      );
    }
    if (status === 403) {
      throw new ForbiddenException(
        'Permission refusée par GitLab. Vérifiez les droits read_repository/write_repository du token.',
      );
    }
    if (status === 404) {
      throw new NotFoundException(
        parsedMessage || `${fallbackMessage} (ressource introuvable).`,
      );
    }
    if (status === 409) {
      throw new ConflictException(
        parsedMessage ||
          `${fallbackMessage} (conflit GitLab: branche protégée ou opération concurrente).`,
      );
    }
    if (status === 422) {
      if (normalizedMessage.includes('invalid url')) {
        throw new UnprocessableEntityException(
          `${fallbackMessage} GitLab a refusé l'URL du webhook. Vérifiez WEBHOOK_URL (URL publique en http/https).`,
        );
      }
      throw new UnprocessableEntityException(
        parsedMessage || `${fallbackMessage} (payload GitLab invalide).`,
      );
    }
    if (status === 400) {
      throw new BadRequestException(parsedMessage || fallbackMessage);
    }

    throw new BadRequestException(
      parsedMessage || `${fallbackMessage} (erreur GitLab inattendue).`,
    );
  }

  private pickString(obj: Record<string, unknown>, key: string): string | null {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return null;
  }

  private pickNestedNumber(
    obj: Record<string, unknown>,
    [first, second]: [string, string],
  ): number | null {
    const levelOne = obj[first];
    if (!levelOne || typeof levelOne !== 'object') {
      return null;
    }
    const value = (levelOne as Record<string, unknown>)[second];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

}

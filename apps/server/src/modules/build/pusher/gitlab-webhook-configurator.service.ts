import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../core/database/prisma.service';
import { GitlabCryptoService } from '../../git-providers/gitlab/gitlab-crypto.service';
import { GitlabFilePusherService } from './gitlab-file-pusher.service';

@Injectable()
export class GitlabWebhookConfiguratorService {
  private readonly logger = new Logger(GitlabWebhookConfiguratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly crypto: GitlabCryptoService,
    private readonly configService: ConfigService,
    private readonly pusher: GitlabFilePusherService,
  ) {}

  async configureWebhook(projectId: string, serviceId?: string): Promise<void> {
    const context = await this.pusher.resolveRepositoryContext(projectId, serviceId);
    const config = await this.prisma.gitlabConfig.findUnique({
      where: { projectId },
      select: { webhookSecret: true },
    });

    if (!config) {
      throw new BadRequestException('Configuration GitLab manquante');
    }

    const webhookUrl = this.resolveWebhookCallbackUrl();
    const webhookSecret = config.webhookSecret
      ? this.crypto.decryptConfigToken(config.webhookSecret)
      : undefined;
    const maxAttempts = this.parsePositiveInt(
      this.configService.get<string>('GITLAB_WEBHOOK_MAX_RETRIES', '3'),
      3,
    );
    const retryDelayMs = this.parsePositiveInt(
      this.configService.get<string>('GITLAB_WEBHOOK_RETRY_DELAY_MS', '1000'),
      1200,
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await firstValueFrom(
          this.httpService.post(
            `${context.baseUrl}/api/v4/projects/${encodeURIComponent(String(context.gitlabProjectId))}/hooks`,
            {
              url: webhookUrl,
              token: webhookSecret,
              push_events: true,
              pipeline_events: true,
            },
            { headers: { 'PRIVATE-TOKEN': context.token } },
          ),
        );
        return;
      } catch (error: unknown) {
        const message = this.pusher.extractGitlabErrorMessage(error).toLowerCase();
        const status = this.pusher.extractHttpStatus(error);
        const duplicateHook =
          status === 409 ||
          message.includes('has already been taken') ||
          message.includes('already exists');

        if (duplicateHook) {
          this.logger.warn(
            `GitLab webhook already exists for project ${String(context.gitlabProjectId)}.`,
          );
          return;
        }

        if (
          attempt < maxAttempts &&
          this.isRetryableWebhookError(error, status)
        ) {
          const backoffMs = retryDelayMs * attempt;
          this.logger.warn(
            `[GitLab] webhook setup attempt ${String(attempt)}/${String(maxAttempts)} failed for project ${String(context.gitlabProjectId)}. Retrying in ${String(backoffMs)}ms...`,
          );
          await this.sleep(backoffMs);
          continue;
        }

        this.pusher.throwGitlabMappedError(
          'configuration du webhook GitLab',
          error,
          'Impossible de configurer le webhook GitLab.',
        );
      }
    }
  }

  private parsePositiveInt(
    rawValue: string | undefined,
    fallback: number,
  ): number {
    const value = Number.parseInt(rawValue ?? '', 10);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return value;
  }

  private isRetryableWebhookError(
    error: unknown,
    status: number | null,
  ): boolean {
    if (status !== null) {
      return [408, 429, 500, 502, 503, 504].includes(status);
    }

    if (error && typeof error === 'object') {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string') {
        return [
          'ECONNABORTED',
          'ECONNRESET',
          'ECONNREFUSED',
          'ENOTFOUND',
          'EHOSTUNREACH',
          'ETIMEDOUT',
        ].includes(code);
      }
    }

    return false;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private resolveWebhookCallbackUrl(): string {
    const rawWebhookBaseUrl = this.configService.get<string>('WEBHOOK_URL', '').trim();
    if (!rawWebhookBaseUrl) {
      throw new BadRequestException(
        'WEBHOOK_URL manquante. Configurez une URL publique du backend (ex: https://deploy.example.com).',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(rawWebhookBaseUrl);
    } catch {
      throw new BadRequestException(
        'WEBHOOK_URL invalide. Utilisez une URL absolue en http/https (ex: https://deploy.example.com).',
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException(
        'WEBHOOK_URL invalide. Seuls les schémas http:// et https:// sont autorisés.',
      );
    }

    parsed.search = '';
    parsed.hash = '';

    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    const normalizedBaseUrl = `${parsed.origin}${normalizedPath}`;

    if (normalizedPath.toLowerCase().endsWith('/gitlab/webhook')) {
      return normalizedBaseUrl;
    }

    return `${normalizedBaseUrl}/gitlab/webhook`;
  }
}

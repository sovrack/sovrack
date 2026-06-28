import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitProviderType, type GitProviderConfig } from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export type GitlabOAuthStartResult = {
  providerId: string;
  authorizeUrl: string;
  redirectUri: string;
  stateExpiresAt: string;
};

export type GitlabOAuthCallbackInput = {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
  callbackBaseUrl: string;
};

export type GitlabOAuthCallbackResult = {
  ok: boolean;
  message: string;
  redirectTo: string;
};

type GitlabTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
};

const GITLAB_OAUTH_SCOPES = 'api read_user read_repository';
const GITLAB_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const LEGACY_GITLAB_KEYS = [
  'GITLAB_PROVIDER_NAME',
  'GITLAB_URL',
  'GITLAB_INTERNAL_URL',
  'GITLAB_REDIRECT_URI',
  'GITLAB_APP_ID',
  'GITLAB_APP_SECRET',
  'GITLAB_GROUP_NAMES',
  'GITLAB_TOKEN',
  'GITLAB_OAUTH_ACCESS_TOKEN',
  'GITLAB_OAUTH_REFRESH_TOKEN',
  'GITLAB_OAUTH_EXPIRES_AT',
];

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class GitProviderOauthService {
  private readonly logger = new Logger(GitProviderOauthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly crypto: CryptoService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Public OAuth Methods ─────────────────────────────────────────────────

  async startGitlabOAuth(
    callbackBaseUrl: string,
  ): Promise<GitlabOAuthStartResult> {
    const provider = await this.getDefaultGitlabProvider();
    if (!provider) {
      throw new BadRequestException(
        'Aucun provider GitLab par défaut configuré',
      );
    }
    return this.startGitlabOAuthForProvider(provider.id, callbackBaseUrl);
  }

  async startGitlabOAuthForProvider(
    providerId: string,
    callbackBaseUrl: string,
  ): Promise<GitlabOAuthStartResult> {
    const provider = await this.getGitlabProviderOrFail(providerId);
    const gitlabUrl = provider.providerUrl.trim();
    const appId = (provider.applicationId ?? '').trim();
    const appSecret = provider.applicationSecret
      ? this.crypto.decrypt(provider.applicationSecret).trim()
      : '';

    if (!gitlabUrl || !appId || !appSecret) {
      throw new BadRequestException(
        'Configure GitLab URL, Application ID et Application Secret avant OAuth',
      );
    }

    const redirectUri = await this.resolveGitlabProviderRedirectUri(
      provider,
      callbackBaseUrl,
    );
    const state = randomBytes(32).toString('hex');
    const stateExpiresAtDate = new Date(Date.now() + GITLAB_OAUTH_STATE_TTL_MS);

    await this.prisma.gitProviderConfig.update({
      where: { id: provider.id },
      data: { oauthState: state, oauthStateExpiresAt: stateExpiresAtDate },
    });

    const normalizedUrl = this.normalizeGitlabBaseUrl(gitlabUrl);
    const authorizeUrl = new URL(`${normalizedUrl}/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', appId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', GITLAB_OAUTH_SCOPES);
    authorizeUrl.searchParams.set('state', state);

    return {
      providerId: provider.id,
      authorizeUrl: authorizeUrl.toString(),
      redirectUri,
      stateExpiresAt: stateExpiresAtDate.toISOString(),
    };
  }

  async completeGitlabOAuthCallback(
    input: GitlabOAuthCallbackInput,
  ): Promise<GitlabOAuthCallbackResult> {
    const fail = (
      message: string,
      providerId?: string,
    ): GitlabOAuthCallbackResult => ({
      ok: false,
      message,
      redirectTo: this.buildFrontendSettingsRedirect(
        'error',
        message,
        providerId,
      ),
    });

    if (input.error) {
      return fail(input.errorDescription?.trim() || input.error.trim());
    }

    if (!input.code || !input.state) {
      return fail('Code OAuth ou state manquant');
    }

    const provider = await this.resolveOAuthProviderByState(input.state);
    if (!provider) {
      return fail('State OAuth GitLab invalide ou expiré');
    }

    try {
      const gitlabUrl = this.normalizeGitlabBaseUrl(
        provider.providerUrl.trim(),
      );
      const appId = (provider.applicationId ?? '').trim();
      const appSecret = provider.applicationSecret
        ? this.crypto.decrypt(provider.applicationSecret).trim()
        : '';
      const redirectUri = await this.resolveGitlabProviderRedirectUri(
        provider,
        input.callbackBaseUrl,
      );

      if (!appId || !appSecret) {
        throw new BadRequestException('Application ID/Secret GitLab manquant');
      }

      const payload = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        code: input.code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString();

      const tokenResponse = await firstValueFrom(
        this.http.post<GitlabTokenResponse>(
          `${gitlabUrl}/oauth/token`,
          payload,
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );

      const accessToken = tokenResponse.data.access_token?.trim() ?? '';
      const refreshToken = tokenResponse.data.refresh_token?.trim() ?? '';
      const expiresIn = tokenResponse.data.expires_in;

      if (!accessToken) {
        throw new BadRequestException(
          "GitLab n'a pas renvoyé de access_token OAuth",
        );
      }

      await this.prisma.gitProviderConfig.update({
        where: { id: provider.id },
        data: {
          oauthAccessToken: this.crypto.encrypt(accessToken),
          oauthRefreshToken: refreshToken
            ? this.crypto.encrypt(refreshToken)
            : null,
          oauthExpiresAt:
            typeof expiresIn === 'number' && expiresIn > 0
              ? new Date(Date.now() + expiresIn * 1000)
              : null,
          oauthState: null,
          oauthStateExpiresAt: null,
        },
      });

      if (provider.isDefault) {
        try {
          await this.syncLegacyDefaultGitlabConfig();
        } catch (syncErr) {
          this.logger.warn(
            `syncLegacyDefaultGitlabConfig failed after token save (provider ${provider.id}): ${String(syncErr)}`,
          );
        }
      }

      return {
        ok: true,
        message: 'Connexion OAuth GitLab réussie',
        redirectTo: this.buildFrontendSettingsRedirect(
          'success',
          undefined,
          provider.id,
        ),
      };
    } catch (err) {
      const axiosData = (
        err as {
          response?: {
            data?: {
              error_description?: string;
              error?: string;
              message?: string;
            };
          };
        }
      )?.response?.data;
      const gitlabMsg =
        axiosData?.error_description ?? axiosData?.error ?? axiosData?.message;
      const reason = err instanceof Error ? err.message : String(err);
      const displayReason =
        gitlabMsg || reason || 'Connexion OAuth GitLab échouée';

      this.logger.error(
        `OAuth callback failed for provider ${provider.id}: ${displayReason}`,
      );
      return fail(displayReason, provider.id);
    } finally {
      await this.prisma.gitProviderConfig
        .update({
          where: { id: provider.id },
          data: { oauthState: null, oauthStateExpiresAt: null },
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to clear oauthState for provider ${provider.id}: ${String(err)}`,
          );
        });
    }
  }

  async refreshProviderOAuthTokenIfNeeded(
    provider: GitProviderConfig,
  ): Promise<GitProviderConfig> {
    if (!provider.oauthAccessToken || !provider.oauthExpiresAt) return provider;

    const needsRefresh =
      provider.oauthExpiresAt.getTime() <= Date.now() + 30_000;
    if (!needsRefresh) return provider;

    const refreshToken = provider.oauthRefreshToken
      ? this.crypto.decrypt(provider.oauthRefreshToken).trim()
      : '';
    const appId = (provider.applicationId ?? '').trim();
    const appSecret = provider.applicationSecret
      ? this.crypto.decrypt(provider.applicationSecret).trim()
      : '';

    if (!refreshToken || !appId || !appSecret) return provider;

    try {
      const payload = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString();

      const response = await firstValueFrom(
        this.http.post<GitlabTokenResponse>(
          `${this.normalizeGitlabBaseUrl(provider.providerUrl)}/oauth/token`,
          payload,
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );

      const newAccessToken = response.data.access_token?.trim() ?? '';
      const newRefreshToken = response.data.refresh_token?.trim() ?? '';
      const expiresIn = response.data.expires_in;

      if (!newAccessToken) return provider;

      const updated = await this.prisma.gitProviderConfig.update({
        where: { id: provider.id },
        data: {
          oauthAccessToken: this.crypto.encrypt(newAccessToken),
          oauthRefreshToken: newRefreshToken
            ? this.crypto.encrypt(newRefreshToken)
            : provider.oauthRefreshToken,
          oauthExpiresAt:
            typeof expiresIn === 'number' && expiresIn > 0
              ? new Date(Date.now() + expiresIn * 1000)
              : provider.oauthExpiresAt,
        },
      });

      if (updated.isDefault) {
        await this.syncLegacyDefaultGitlabConfig();
      }

      return updated;
    } catch {
      return provider;
    }
  }

  // ─── Private OAuth Helpers ────────────────────────────────────────────────

  private async resolveGitlabProviderRedirectUri(
    provider: GitProviderConfig,
    callbackBaseUrl: string,
  ): Promise<string> {
    const existing = this.normalizeOptional(provider.redirectUri);
    if (existing) return existing;

    const fallback = `${callbackBaseUrl.replace(/\/+$/, '')}/gitlab/callback`;
    await this.prisma.gitProviderConfig.update({
      where: { id: provider.id },
      data: { redirectUri: fallback },
    });
    return fallback;
  }

  private async resolveOAuthProviderByState(
    incomingState: string,
  ): Promise<GitProviderConfig | null> {
    const candidates = await this.prisma.gitProviderConfig.findMany({
      where: { type: GitProviderType.GITLAB, oauthState: { not: null } },
    });
    const now = Date.now();

    for (const provider of candidates) {
      if (!provider.oauthState || !provider.oauthStateExpiresAt) continue;
      if (provider.oauthStateExpiresAt.getTime() < now) continue;

      const expectedBuffer = Buffer.from(provider.oauthState);
      const incomingBuffer = Buffer.from(incomingState);
      if (expectedBuffer.length !== incomingBuffer.length) continue;
      if (timingSafeEqual(expectedBuffer, incomingBuffer)) return provider;
    }

    return null;
  }

  private buildFrontendSettingsRedirect(
    status: 'success' | 'error',
    message?: string,
    providerId?: string,
  ): string {
    const frontendBase = this.configService
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    const url = new URL(`${frontendBase}/settings/git`);
    url.searchParams.set('oauth', status);
    if (providerId) url.searchParams.set('provider_id', providerId);
    if (message) url.searchParams.set('oauth_message', message);
    return url.toString();
  }

  // ─── Shared helpers (duplicated from config service to avoid circular dep) ──

  private async getGitlabProviderOrFail(
    id: string,
  ): Promise<GitProviderConfig> {
    const provider = await this.prisma.gitProviderConfig.findUnique({
      where: { id },
    });
    if (!provider || provider.type !== GitProviderType.GITLAB) {
      throw new NotFoundException('Provider GitLab introuvable');
    }
    return provider;
  }

  private async getDefaultGitlabProvider(): Promise<GitProviderConfig | null> {
    const defaultProvider = await this.prisma.gitProviderConfig.findFirst({
      where: { type: GitProviderType.GITLAB, isDefault: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (defaultProvider) return defaultProvider;
    return this.prisma.gitProviderConfig.findFirst({
      where: { type: GitProviderType.GITLAB },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async syncLegacyDefaultGitlabConfig(): Promise<void> {
    const provider = await this.getDefaultGitlabProvider();

    if (!provider) {
      await this.prisma.platformConfig.deleteMany({
        where: { key: { in: LEGACY_GITLAB_KEYS } },
      });
      return;
    }

    const upsertOrClear = async (
      key: string,
      value: string | null | undefined,
      isSecret: boolean,
    ) => {
      const normalized = this.normalizeOptional(value);
      if (!normalized) {
        await this.prisma.platformConfig.deleteMany({ where: { key } });
        return;
      }
      const stored = isSecret ? this.crypto.encrypt(normalized) : normalized;
      await this.prisma.platformConfig.upsert({
        where: { key },
        update: { value: stored, isSecret },
        create: { key, value: stored, isSecret },
      });
    };

    await Promise.all([
      upsertOrClear('GITLAB_PROVIDER_NAME', provider.name, false),
      upsertOrClear('GITLAB_URL', provider.providerUrl, false),
      upsertOrClear('GITLAB_INTERNAL_URL', provider.internalUrl, false),
      upsertOrClear('GITLAB_REDIRECT_URI', provider.redirectUri, false),
      upsertOrClear('GITLAB_APP_ID', provider.applicationId, false),
      upsertOrClear(
        'GITLAB_APP_SECRET',
        provider.applicationSecret
          ? this.crypto.decrypt(provider.applicationSecret)
          : null,
        true,
      ),
      upsertOrClear('GITLAB_GROUP_NAMES', provider.groupNames, false),
      upsertOrClear(
        'GITLAB_TOKEN',
        provider.adminToken ? this.crypto.decrypt(provider.adminToken) : null,
        true,
      ),
      upsertOrClear(
        'GITLAB_OAUTH_ACCESS_TOKEN',
        provider.oauthAccessToken
          ? this.crypto.decrypt(provider.oauthAccessToken)
          : null,
        true,
      ),
      upsertOrClear(
        'GITLAB_OAUTH_REFRESH_TOKEN',
        provider.oauthRefreshToken
          ? this.crypto.decrypt(provider.oauthRefreshToken)
          : null,
        true,
      ),
      upsertOrClear(
        'GITLAB_OAUTH_EXPIRES_AT',
        provider.oauthExpiresAt?.toISOString() ?? null,
        false,
      ),
    ]);
  }

  private normalizeGitlabBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private normalizeOptional(value?: string | null): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}

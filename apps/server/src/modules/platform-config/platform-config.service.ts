import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  GitProviderType,
  RegistryProviderType,
  type GitProviderConfig,
  type RegistryConfig,
  type PlatformConfig,
} from '@prisma/client';
import * as CryptoJS from 'crypto-js';
import { randomBytes, timingSafeEqual } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

type PlatformConfigPublic = Omit<PlatformConfig, 'value'> & { value: string };

type GitProviderStatus = 'NOT_CONFIGURED' | 'ACTION_REQUIRED' | 'CONFIGURED';

export type GitlabProviderPublic = {
  id: string;
  name: string;
  type: 'GITLAB';
  gitlabUrl: string;
  internalUrl: string;
  redirectUri: string;
  applicationId: string;
  applicationSecretConfigured: boolean;
  groupNames: string;
  adminTokenConfigured: boolean;
  oauthTokenConfigured: boolean;
  oauthExpiresAt: string | null;
  status: GitProviderStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GitlabProviderProjectOption = {
  id: string;
  name: string;
  gitlabUrl: string;
  isDefault: boolean;
  status: GitProviderStatus;
};

export type ResolvedGitlabCredentials = {
  providerId: string;
  gitlabUrl: string;
  token: string;
  tokenSource: 'oauth' | 'admin';
};

export type UpsertGitlabProviderInput = {
  name: string;
  gitlabUrl: string;
  internalUrl?: string;
  redirectUri?: string;
  applicationId?: string;
  applicationSecret?: string;
  groupNames?: string;
  adminToken?: string;
  isDefault?: boolean;
};

export type PatchGitlabProviderInput = {
  name?: string;
  gitlabUrl?: string;
  internalUrl?: string;
  redirectUri?: string;
  applicationId?: string;
  applicationSecret?: string;
  groupNames?: string;
  adminToken?: string;
  isDefault?: boolean;
};

export type GitlabOAuthStartResult = {
  providerId: string;
  authorizeUrl: string;
  redirectUri: string;
  stateExpiresAt: string;
};

type GitlabOAuthCallbackInput = {
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

export type RegistryConfigPublic = {
  id: string;
  name: string;
  type: RegistryProviderType;
  username: string;
  registryUrl: string;
  isDefault: boolean;
  isConnected: boolean;
  connectionError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertRegistryConfigInput = {
  name: string;
  type: RegistryProviderType;
  username?: string;
  password?: string;
  registryUrl?: string;
  isDefault?: boolean;
};

export type PatchRegistryConfigInput = {
  name?: string;
  type?: RegistryProviderType;
  username?: string;
  password?: string;
  registryUrl?: string;
  isDefault?: boolean;
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

@Injectable()
export class PlatformConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  async get(key: string): Promise<string | null> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { key },
    });

    if (!config) {
      return null;
    }

    return config.isSecret ? this.decrypt(config.value) : config.value;
  }

  async getOrFail(key: string): Promise<string> {
    const value = await this.get(key);
    if (value === null) {
      throw new NotFoundException(`Configuration "${key}" non trouvée`);
    }
    return value;
  }

  async set(
    key: string,
    value: string,
    isSecret?: boolean,
  ): Promise<PlatformConfigPublic> {
    const existing = await this.prisma.platformConfig.findUnique({
      where: { key },
    });

    const nextIsSecret = isSecret ?? existing?.isSecret ?? false;
    const isMaskedValue = value === '***';

    let valueToPersist = value;

    if (existing?.isSecret && isMaskedValue) {
      if (nextIsSecret) {
        valueToPersist = existing.value;
      } else {
        valueToPersist = this.decrypt(existing.value);
      }
    } else if (nextIsSecret) {
      valueToPersist = this.encrypt(value);
    }

    const saved = await this.prisma.platformConfig.upsert({
      where: { key },
      update: {
        value: valueToPersist,
        isSecret: nextIsSecret,
      },
      create: {
        key,
        value: valueToPersist,
        isSecret: nextIsSecret,
      },
    });

    return this.toPublic(saved);
  }

  async getAll(): Promise<PlatformConfigPublic[]> {
    const configs = await this.prisma.platformConfig.findMany({
      orderBy: { key: 'asc' },
    });

    return configs.map((item) => this.toPublic(item));
  }

  async listGitlabProviders(): Promise<GitlabProviderPublic[]> {
    await this.bootstrapLegacyGitlabProviderIfNeeded();

    const providers = await this.prisma.gitProviderConfig.findMany({
      where: { type: GitProviderType.GITLAB },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });

    return providers.map((provider) => this.toGitlabProviderPublic(provider));
  }

  async listGitlabProvidersForProjects(): Promise<
    GitlabProviderProjectOption[]
  > {
    const providers = await this.listGitlabProviders();
    return providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      gitlabUrl: provider.gitlabUrl,
      isDefault: provider.isDefault,
      status: provider.status,
    }));
  }

  async resolveGitlabCredentials(
    providerId?: string,
  ): Promise<ResolvedGitlabCredentials> {
    await this.bootstrapLegacyGitlabProviderIfNeeded();

    const provider = providerId
      ? await this.getGitlabProviderOrFail(providerId)
      : await this.getDefaultGitlabProvider();

    if (!provider) {
      throw new BadRequestException('Aucun provider GitLab configuré');
    }

    const refreshed = await this.refreshProviderOAuthTokenIfNeeded(provider);
    const gitlabUrl = refreshed.gitlabUrl.trim();
    if (!gitlabUrl) {
      throw new BadRequestException('GitLab URL manquante sur le provider');
    }

    const oauthToken = refreshed.oauthAccessToken
      ? this.decrypt(refreshed.oauthAccessToken).trim()
      : '';
    if (oauthToken) {
      return {
        providerId: refreshed.id,
        gitlabUrl,
        token: oauthToken,
        tokenSource: 'oauth',
      };
    }

    const adminToken = refreshed.adminToken
      ? this.decrypt(refreshed.adminToken).trim()
      : '';
    if (adminToken) {
      return {
        providerId: refreshed.id,
        gitlabUrl,
        token: adminToken,
        tokenSource: 'admin',
      };
    }

    throw new BadRequestException(
      'Ce provider ne possède ni OAuth token ni Admin token',
    );
  }

  async createGitlabProvider(
    input: UpsertGitlabProviderInput,
  ): Promise<GitlabProviderPublic> {
    const name = this.requireNonEmpty(input.name, 'Name est requis');
    const gitlabUrl = this.requireNonEmpty(
      input.gitlabUrl,
      'GitLab URL est requis',
    );

    const providersCount = await this.prisma.gitProviderConfig.count({
      where: { type: GitProviderType.GITLAB },
    });

    const shouldBeDefault =
      providersCount === 0 ? true : input.isDefault === true;

    if (shouldBeDefault) {
      await this.prisma.gitProviderConfig.updateMany({
        where: { type: GitProviderType.GITLAB, isDefault: true },
        data: { isDefault: false },
      });
    }

    const provider = await this.prisma.gitProviderConfig.create({
      data: {
        name,
        type: GitProviderType.GITLAB,
        gitlabUrl,
        internalUrl: this.normalizeOptionalString(input.internalUrl),
        redirectUri: this.normalizeOptionalString(input.redirectUri),
        applicationId: this.normalizeOptionalString(input.applicationId),
        applicationSecret: this.encryptOptional(input.applicationSecret),
        groupNames: this.normalizeOptionalString(input.groupNames),
        adminToken: this.encryptOptional(input.adminToken),
        isDefault: shouldBeDefault,
      },
    });

    if (shouldBeDefault) {
      await this.syncLegacyDefaultGitlabConfig();
    }

    return this.toGitlabProviderPublic(provider);
  }

  async updateGitlabProvider(
    id: string,
    input: PatchGitlabProviderInput,
  ): Promise<GitlabProviderPublic> {
    const current = await this.getGitlabProviderOrFail(id);

    const data: Partial<GitProviderConfig> = {};

    if (typeof input.name === 'string') {
      data.name = this.requireNonEmpty(input.name, 'Name est requis');
    }

    if (typeof input.gitlabUrl === 'string') {
      data.gitlabUrl = this.requireNonEmpty(
        input.gitlabUrl,
        'GitLab URL est requis',
      );
    }

    if (typeof input.internalUrl === 'string') {
      data.internalUrl = this.normalizeOptionalString(input.internalUrl);
    }

    if (typeof input.redirectUri === 'string') {
      data.redirectUri = this.normalizeOptionalString(input.redirectUri);
    }

    if (typeof input.applicationId === 'string') {
      data.applicationId = this.normalizeOptionalString(input.applicationId);
    }

    if (typeof input.groupNames === 'string') {
      data.groupNames = this.normalizeOptionalString(input.groupNames);
    }

    if (typeof input.applicationSecret === 'string') {
      data.applicationSecret = this.encryptOptional(input.applicationSecret);
    }

    if (typeof input.adminToken === 'string') {
      data.adminToken = this.encryptOptional(input.adminToken);
    }

    if (input.isDefault === true && !current.isDefault) {
      await this.prisma.gitProviderConfig.updateMany({
        where: { type: GitProviderType.GITLAB, isDefault: true },
        data: { isDefault: false },
      });
      data.isDefault = true;
    }

    const updated = await this.prisma.gitProviderConfig.update({
      where: { id },
      data,
    });

    if (updated.isDefault || current.isDefault || input.isDefault === true) {
      await this.syncLegacyDefaultGitlabConfig();
    }

    return this.toGitlabProviderPublic(updated);
  }

  async deleteGitlabProvider(id: string): Promise<void> {
    const provider = await this.getGitlabProviderOrFail(id);

    await this.prisma.gitProviderConfig.delete({ where: { id } });

    if (provider.isDefault) {
      const replacement = await this.prisma.gitProviderConfig.findFirst({
        where: { type: GitProviderType.GITLAB },
        orderBy: { createdAt: 'asc' },
      });

      if (replacement) {
        await this.prisma.gitProviderConfig.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        });
      }
    }

    await this.syncLegacyDefaultGitlabConfig();
  }

  async setDefaultGitlabProvider(id: string): Promise<GitlabProviderPublic> {
    await this.getGitlabProviderOrFail(id);

    await this.prisma.$transaction([
      this.prisma.gitProviderConfig.updateMany({
        where: { type: GitProviderType.GITLAB, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.gitProviderConfig.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    await this.syncLegacyDefaultGitlabConfig();

    const updated = await this.getGitlabProviderOrFail(id);
    return this.toGitlabProviderPublic(updated);
  }

  async testGitlab(
    providerId?: string,
  ): Promise<{ ok: boolean; message: string }> {
    await this.bootstrapLegacyGitlabProviderIfNeeded();

    if (providerId) {
      const provider = await this.getGitlabProviderOrFail(providerId);
      return await this.testGitlabProvider(provider);
    }

    const defaultProvider = await this.getDefaultGitlabProvider();
    if (defaultProvider) {
      return await this.testGitlabProvider(defaultProvider);
    }

    return await this.testGitlabLegacyConfig();
  }

  async startGitlabOAuth(
    callbackBaseUrl: string,
  ): Promise<GitlabOAuthStartResult> {
    await this.bootstrapLegacyGitlabProviderIfNeeded();

    const provider = await this.getDefaultGitlabProvider();
    if (!provider) {
      throw new BadRequestException(
        'Aucun provider GitLab par défaut configuré',
      );
    }
    return await this.startGitlabOAuthForProvider(provider.id, callbackBaseUrl);
  }

  async startGitlabOAuthForProvider(
    providerId: string,
    callbackBaseUrl: string,
  ): Promise<GitlabOAuthStartResult> {
    const provider = await this.getGitlabProviderOrFail(providerId);

    const gitlabUrl = provider.gitlabUrl.trim();
    const appId = (provider.applicationId ?? '').trim();
    const appSecret = provider.applicationSecret
      ? this.decrypt(provider.applicationSecret).trim()
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
      data: {
        oauthState: state,
        oauthStateExpiresAt: stateExpiresAtDate,
      },
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
      const gitlabUrl = this.normalizeGitlabBaseUrl(provider.gitlabUrl.trim());
      const appId = (provider.applicationId ?? '').trim();
      const appSecret = provider.applicationSecret
        ? this.decrypt(provider.applicationSecret).trim()
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
        this.httpService.post<GitlabTokenResponse>(
          `${gitlabUrl}/oauth/token`,
          payload,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const accessToken = tokenResponse.data.access_token?.trim() ?? '';
      const refreshToken = tokenResponse.data.refresh_token?.trim() ?? '';
      const expiresIn = tokenResponse.data.expires_in;

      if (!accessToken) {
        throw new BadRequestException(
          'GitLab n a pas renvoyé de access_token OAuth',
        );
      }

      await this.prisma.gitProviderConfig.update({
        where: { id: provider.id },
        data: {
          oauthAccessToken: this.encrypt(accessToken),
          oauthRefreshToken: refreshToken ? this.encrypt(refreshToken) : null,
          oauthExpiresAt:
            typeof expiresIn === 'number' && expiresIn > 0
              ? new Date(Date.now() + expiresIn * 1000)
              : null,
          oauthState: null,
          oauthStateExpiresAt: null,
        },
      });

      if (provider.isDefault) {
        await this.syncLegacyDefaultGitlabConfig();
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
    } catch {
      return fail('Connexion OAuth GitLab échouée', provider.id);
    } finally {
      await this.prisma.gitProviderConfig.update({
        where: { id: provider.id },
        data: {
          oauthState: null,
          oauthStateExpiresAt: null,
        },
      });
    }
  }

  private async testGitlabProvider(
    provider: GitProviderConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const providerWithFreshToken =
      await this.refreshProviderOAuthTokenIfNeeded(provider);
    const gitlabUrl = this.normalizeGitlabBaseUrl(
      providerWithFreshToken.gitlabUrl.trim(),
    );

    if (!gitlabUrl) {
      throw new BadRequestException('GitLab URL manquant pour ce provider');
    }

    const oauthToken = providerWithFreshToken.oauthAccessToken
      ? this.decrypt(providerWithFreshToken.oauthAccessToken).trim()
      : '';

    const adminToken = providerWithFreshToken.adminToken
      ? this.decrypt(providerWithFreshToken.adminToken).trim()
      : '';

    if (!oauthToken && !adminToken) {
      throw new BadRequestException(
        'Configure un token OAuth ou un Admin Token pour ce provider',
      );
    }

    if (oauthToken) {
      try {
        await this.requestGitlabCurrentUser(gitlabUrl, {
          Authorization: `Bearer ${oauthToken}`,
        });
        return {
          ok: true,
          message: 'Connexion GitLab valide (OAuth)',
        };
      } catch {
        // fallback sur admin token
      }
    }

    if (adminToken) {
      await this.requestGitlabCurrentUser(gitlabUrl, {
        'PRIVATE-TOKEN': adminToken,
      });
      return {
        ok: true,
        message: oauthToken
          ? 'Connexion GitLab valide (fallback Admin Token)'
          : 'Connexion GitLab valide (Admin Token)',
      };
    }

    throw new BadRequestException('Test GitLab échoué');
  }

  private async testGitlabLegacyConfig(): Promise<{
    ok: boolean;
    message: string;
  }> {
    const gitlabUrl = ((await this.get('GITLAB_URL')) ?? '').trim();
    const oauthToken = (
      (await this.get('GITLAB_OAUTH_ACCESS_TOKEN')) ?? ''
    ).trim();
    const adminToken = ((await this.get('GITLAB_TOKEN')) ?? '').trim();

    if (!gitlabUrl) {
      throw new BadRequestException('GITLAB_URL doit être configuré');
    }

    if (!oauthToken && !adminToken) {
      throw new BadRequestException(
        'Configure un token OAuth GitLab ou GITLAB_TOKEN avant le test',
      );
    }

    const normalizedUrl = this.normalizeGitlabBaseUrl(gitlabUrl);

    if (oauthToken) {
      try {
        await this.requestGitlabCurrentUser(normalizedUrl, {
          Authorization: `Bearer ${oauthToken}`,
        });
        return {
          ok: true,
          message: 'Connexion GitLab valide (OAuth)',
        };
      } catch {
        // fallback sur admin token
      }
    }

    if (adminToken) {
      await this.requestGitlabCurrentUser(normalizedUrl, {
        'PRIVATE-TOKEN': adminToken,
      });
      return {
        ok: true,
        message: oauthToken
          ? 'Connexion GitLab valide (fallback Admin Token)'
          : 'Connexion GitLab valide (Admin Token)',
      };
    }

    throw new BadRequestException('Test GitLab échoué');
  }

  private async requestGitlabCurrentUser(
    gitlabBaseUrl: string,
    headers: Record<string, string>,
  ): Promise<void> {
    await firstValueFrom(
      this.httpService.get(`${gitlabBaseUrl}/api/v4/user`, { headers }),
    );
  }

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

    if (defaultProvider) {
      return defaultProvider;
    }

    return await this.prisma.gitProviderConfig.findFirst({
      where: { type: GitProviderType.GITLAB },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async resolveGitlabProviderRedirectUri(
    provider: GitProviderConfig,
    callbackBaseUrl: string,
  ): Promise<string> {
    const existing = this.normalizeOptionalString(provider.redirectUri);
    if (existing) {
      return existing;
    }

    const normalizedBase = callbackBaseUrl.replace(/\/+$/, '');
    const fallback = `${normalizedBase}/providers/gitlab/callback`;

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
      where: {
        type: GitProviderType.GITLAB,
        oauthState: { not: null },
      },
    });

    const now = Date.now();

    for (const provider of candidates) {
      if (!provider.oauthState || !provider.oauthStateExpiresAt) {
        continue;
      }

      if (provider.oauthStateExpiresAt.getTime() < now) {
        continue;
      }

      const expectedBuffer = Buffer.from(provider.oauthState);
      const incomingBuffer = Buffer.from(incomingState);

      if (expectedBuffer.length !== incomingBuffer.length) {
        continue;
      }

      if (timingSafeEqual(expectedBuffer, incomingBuffer)) {
        return provider;
      }
    }

    return null;
  }

  private toGitlabProviderPublic(
    provider: GitProviderConfig,
  ): GitlabProviderPublic {
    const hasAppSecret = Boolean(provider.applicationSecret);
    const hasOauth = Boolean(provider.oauthAccessToken);
    const hasAdminToken = Boolean(provider.adminToken);

    let status: GitProviderStatus = 'NOT_CONFIGURED';

    if (provider.gitlabUrl || provider.applicationId || hasAppSecret) {
      if (!provider.gitlabUrl || !provider.applicationId || !hasAppSecret) {
        status = 'ACTION_REQUIRED';
      } else {
        status = hasOauth || hasAdminToken ? 'CONFIGURED' : 'ACTION_REQUIRED';
      }
    }

    return {
      id: provider.id,
      name: provider.name,
      type: 'GITLAB',
      gitlabUrl: provider.gitlabUrl,
      internalUrl: provider.internalUrl ?? '',
      redirectUri: provider.redirectUri ?? '',
      applicationId: provider.applicationId ?? '',
      applicationSecretConfigured: hasAppSecret,
      groupNames: provider.groupNames ?? '',
      adminTokenConfigured: hasAdminToken,
      oauthTokenConfigured: hasOauth,
      oauthExpiresAt: provider.oauthExpiresAt?.toISOString() ?? null,
      status,
      isDefault: provider.isDefault,
      createdAt: provider.createdAt.toISOString(),
      updatedAt: provider.updatedAt.toISOString(),
    };
  }

  private requireNonEmpty(value: string, errorMessage: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(errorMessage);
    }
    return normalized;
  }

  private normalizeOptionalString(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private encryptOptional(value?: string | null): string | null {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized) {
      return null;
    }
    return this.encrypt(normalized);
  }

  private normalizeGitlabBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private buildFrontendSettingsRedirect(
    status: 'success' | 'error',
    message?: string,
    providerId?: string,
  ): string {
    const frontendBase = (
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ).replace(/\/+$/, '');
    const url = new URL(`${frontendBase}/settings/git`);
    url.searchParams.set('oauth', status);

    if (providerId) {
      url.searchParams.set('provider_id', providerId);
    }

    if (message) {
      url.searchParams.set('oauth_message', message);
    }

    return url.toString();
  }

  private async syncLegacyDefaultGitlabConfig(): Promise<void> {
    const provider = await this.getDefaultGitlabProvider();

    if (!provider) {
      await this.clearPlatformConfigKeys(LEGACY_GITLAB_KEYS);
      return;
    }

    await this.setOrClearPlatformConfig(
      'GITLAB_PROVIDER_NAME',
      provider.name,
      false,
    );
    await this.setOrClearPlatformConfig(
      'GITLAB_URL',
      provider.gitlabUrl,
      false,
    );
    await this.setOrClearPlatformConfig(
      'GITLAB_INTERNAL_URL',
      provider.internalUrl,
      false,
    );
    await this.setOrClearPlatformConfig(
      'GITLAB_REDIRECT_URI',
      provider.redirectUri,
      false,
    );
    await this.setOrClearPlatformConfig(
      'GITLAB_APP_ID',
      provider.applicationId,
      false,
    );
    await this.setOrClearPlatformConfig(
      'GITLAB_APP_SECRET',
      provider.applicationSecret
        ? this.decrypt(provider.applicationSecret)
        : null,
      true,
    );
    await this.setOrClearPlatformConfig(
      'GITLAB_GROUP_NAMES',
      provider.groupNames,
      false,
    );
    await this.setOrClearPlatformConfig(
      'GITLAB_TOKEN',
      provider.adminToken ? this.decrypt(provider.adminToken) : null,
      true,
    );
    await this.setOrClearPlatformConfig(
      'GITLAB_OAUTH_ACCESS_TOKEN',
      provider.oauthAccessToken
        ? this.decrypt(provider.oauthAccessToken)
        : null,
      true,
    );
    await this.setOrClearPlatformConfig(
      'GITLAB_OAUTH_REFRESH_TOKEN',
      provider.oauthRefreshToken
        ? this.decrypt(provider.oauthRefreshToken)
        : null,
      true,
    );
    await this.setOrClearPlatformConfig(
      'GITLAB_OAUTH_EXPIRES_AT',
      provider.oauthExpiresAt ? provider.oauthExpiresAt.toISOString() : null,
      false,
    );
  }

  private async setOrClearPlatformConfig(
    key: string,
    value: string | null,
    isSecret: boolean,
  ): Promise<void> {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized) {
      await this.clearPlatformConfigKeys([key]);
      return;
    }

    await this.set(key, normalized, isSecret);
  }

  private async clearPlatformConfigKeys(keys: string[]): Promise<void> {
    await this.prisma.platformConfig.deleteMany({
      where: { key: { in: keys } },
    });
  }

  private toPublic(config: PlatformConfig): PlatformConfigPublic {
    return {
      ...config,
      value: config.isSecret ? '***' : config.value,
    };
  }

  private encrypt(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }

    return CryptoJS.AES.encrypt(value, secret).toString();
  }

  private decrypt(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }

    return CryptoJS.AES.decrypt(value, secret).toString(CryptoJS.enc.Utf8);
  }

  private async bootstrapLegacyGitlabProviderIfNeeded(): Promise<void> {
    const count = await this.prisma.gitProviderConfig.count({
      where: { type: GitProviderType.GITLAB },
    });

    if (count > 0) {
      return;
    }

    const legacyUrl = ((await this.get('GITLAB_URL')) ?? '').trim();
    if (!legacyUrl) {
      return;
    }

    const name =
      ((await this.get('GITLAB_PROVIDER_NAME')) ?? '').trim() ||
      'GitLab Legacy';
    const internalUrl = this.normalizeOptionalString(
      await this.get('GITLAB_INTERNAL_URL'),
    );
    const redirectUri = this.normalizeOptionalString(
      await this.get('GITLAB_REDIRECT_URI'),
    );
    const applicationId = this.normalizeOptionalString(
      await this.get('GITLAB_APP_ID'),
    );
    const applicationSecret = this.encryptOptional(
      await this.get('GITLAB_APP_SECRET'),
    );
    const groupNames = this.normalizeOptionalString(
      await this.get('GITLAB_GROUP_NAMES'),
    );
    const adminToken = this.encryptOptional(await this.get('GITLAB_TOKEN'));
    const oauthAccessToken = this.encryptOptional(
      await this.get('GITLAB_OAUTH_ACCESS_TOKEN'),
    );
    const oauthRefreshToken = this.encryptOptional(
      await this.get('GITLAB_OAUTH_REFRESH_TOKEN'),
    );
    const oauthExpiresAtRaw = this.normalizeOptionalString(
      await this.get('GITLAB_OAUTH_EXPIRES_AT'),
    );
    const oauthExpiresAt = oauthExpiresAtRaw
      ? new Date(oauthExpiresAtRaw)
      : null;

    await this.prisma.gitProviderConfig.create({
      data: {
        name,
        type: GitProviderType.GITLAB,
        gitlabUrl: legacyUrl,
        internalUrl,
        redirectUri,
        applicationId,
        applicationSecret,
        groupNames,
        adminToken,
        oauthAccessToken,
        oauthRefreshToken,
        oauthExpiresAt:
          oauthExpiresAt && !Number.isNaN(oauthExpiresAt.getTime())
            ? oauthExpiresAt
            : null,
        isDefault: true,
      },
    });

    await this.syncLegacyDefaultGitlabConfig();
  }

  private async refreshProviderOAuthTokenIfNeeded(
    provider: GitProviderConfig,
  ): Promise<GitProviderConfig> {
    if (!provider.oauthAccessToken || !provider.oauthExpiresAt) {
      return provider;
    }

    const needsRefresh =
      provider.oauthExpiresAt.getTime() <= Date.now() + 30_000;
    if (!needsRefresh) {
      return provider;
    }

    const refreshToken = provider.oauthRefreshToken
      ? this.decrypt(provider.oauthRefreshToken).trim()
      : '';
    const appId = (provider.applicationId ?? '').trim();
    const appSecret = provider.applicationSecret
      ? this.decrypt(provider.applicationSecret).trim()
      : '';

    if (!refreshToken || !appId || !appSecret) {
      return provider;
    }

    try {
      const payload = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString();

      const response = await firstValueFrom(
        this.httpService.post<GitlabTokenResponse>(
          `${this.normalizeGitlabBaseUrl(provider.gitlabUrl)}/oauth/token`,
          payload,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const newAccessToken = response.data.access_token?.trim() ?? '';
      const newRefreshToken = response.data.refresh_token?.trim() ?? '';
      const expiresIn = response.data.expires_in;

      if (!newAccessToken) {
        return provider;
      }

      const updated = await this.prisma.gitProviderConfig.update({
        where: { id: provider.id },
        data: {
          oauthAccessToken: this.encrypt(newAccessToken),
          oauthRefreshToken: newRefreshToken
            ? this.encrypt(newRefreshToken)
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

  // ============= Registry Configuration Methods =============

  async listRegistryConfigs(): Promise<RegistryConfigPublic[]> {
    const registries = await this.prisma.registryConfig.findMany({
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });

    return registries.map((registry) => this.toRegistryConfigPublic(registry));
  }

  async createRegistryConfig(
    input: UpsertRegistryConfigInput,
  ): Promise<RegistryConfigPublic> {
    const name = this.requireNonEmpty(input.name, 'Name est requis');
    const type = input.type;

    const registriesCount = await this.prisma.registryConfig.count({
      where: { type },
    });

    const shouldBeDefault =
      registriesCount === 0 ? true : input.isDefault === true;

    if (shouldBeDefault) {
      await this.prisma.registryConfig.updateMany({
        where: { type, isDefault: true },
        data: { isDefault: false },
      });
    }

    const registry = await this.prisma.registryConfig.create({
      data: {
        name,
        type,
        username: this.normalizeOptionalString(input.username),
        password: this.encryptOptional(input.password),
        registryUrl: this.normalizeOptionalString(input.registryUrl),
        isDefault: shouldBeDefault,
        isConnected: false,
      },
    });

    return this.toRegistryConfigPublic(registry);
  }

  async updateRegistryConfig(
    id: string,
    input: PatchRegistryConfigInput,
  ): Promise<RegistryConfigPublic> {
    const current = await this.getRegistryConfigOrFail(id);

    const data: Partial<RegistryConfig> = {};

    if (typeof input.name === 'string') {
      data.name = this.requireNonEmpty(input.name, 'Name est requis');
    }

    if (typeof input.type !== 'undefined') {
      data.type = input.type;
    }

    if (typeof input.username === 'string') {
      data.username = this.normalizeOptionalString(input.username);
    }

    if (typeof input.password === 'string') {
      data.password = this.encryptOptional(input.password);
    }

    if (typeof input.registryUrl === 'string') {
      data.registryUrl = this.normalizeOptionalString(input.registryUrl);
    }

    if (input.isDefault === true && !current.isDefault) {
      await this.prisma.registryConfig.updateMany({
        where: { type: current.type, isDefault: true },
        data: { isDefault: false },
      });
      data.isDefault = true;
    }

    const updated = await this.prisma.registryConfig.update({
      where: { id },
      data,
    });

    return this.toRegistryConfigPublic(updated);
  }

  async deleteRegistryConfig(id: string): Promise<void> {
    const registry = await this.getRegistryConfigOrFail(id);

    await this.prisma.registryConfig.delete({ where: { id } });

    if (registry.isDefault) {
      const replacement = await this.prisma.registryConfig.findFirst({
        where: { type: registry.type },
        orderBy: { createdAt: 'asc' },
      });

      if (replacement) {
        await this.prisma.registryConfig.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        });
      }
    }
  }

  async setDefaultRegistryConfig(id: string): Promise<RegistryConfigPublic> {
    const current = await this.getRegistryConfigOrFail(id);

    await this.prisma.$transaction([
      this.prisma.registryConfig.updateMany({
        where: { type: current.type, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.registryConfig.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    const updated = await this.getRegistryConfigOrFail(id);
    return this.toRegistryConfigPublic(updated);
  }

  async testRegistryConnection(
    id: string,
  ): Promise<{ ok: boolean; message: string }> {
    const registry = await this.getRegistryConfigOrFail(id);

    try {
      // Test Docker Hub connection
      if (registry.type === RegistryProviderType.DOCKER_HUB) {
        return await this.testDockerHubConnection(registry);
      }

      // Test other registries
      if (registry.type === RegistryProviderType.DOCKER_REGISTRY) {
        return await this.testDockerRegistryConnection(registry);
      }

      if (registry.type === RegistryProviderType.ECR) {
        return await this.testECRConnection(registry);
      }

      if (registry.type === RegistryProviderType.GCR) {
        return await this.testGCRConnection(registry);
      }

      return { ok: false, message: 'Type de registre non reconnu' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erreur de connexion inconnue';

      await this.prisma.registryConfig.update({
        where: { id },
        data: {
          isConnected: false,
          connectionError: message,
        },
      });

      return { ok: false, message };
    }
  }

  private async testDockerHubConnection(
    registry: RegistryConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const username = registry.username?.trim();
    const password = registry.password
      ? this.decrypt(registry.password).trim()
      : '';

    if (!username || !password) {
      throw new Error('Docker Hub username et password requis');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<{ token?: string }>(
          'https://hub.docker.com/v2/users/login',
          { username, password },
          { timeout: 10000 },
        ),
      );

      if (typeof response.data.token === 'string' && response.data.token) {
        await this.prisma.registryConfig.update({
          where: { id: registry.id },
          data: {
            isConnected: true,
            connectionError: null,
          },
        });

        return { ok: true, message: 'Connexion Docker Hub réussie' };
      }

      throw new Error('Authentification Docker Hub échouée');
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Erreur de connexion Docker Hub',
      );
    }
  }

  private async testDockerRegistryConnection(
    registry: RegistryConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const registryUrl = registry.registryUrl?.trim();
    const username = registry.username?.trim();
    const password = registry.password
      ? this.decrypt(registry.password).trim()
      : '';

    if (!registryUrl) {
      throw new Error('Registry URL requise');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${registryUrl}/v2/`, {
          auth: username && password ? { username, password } : undefined,
          timeout: 10000,
        }),
      );

      if (response.status === 200) {
        await this.prisma.registryConfig.update({
          where: { id: registry.id },
          data: {
            isConnected: true,
            connectionError: null,
          },
        });

        return { ok: true, message: 'Connexion au registre Docker réussie' };
      }

      throw new Error('Authentification au registre Docker échouée');
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Erreur de connexion au registre Docker',
      );
    }
  }

  private async testECRConnection(
    registry: RegistryConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const message =
      'Test ECR non supporté actuellement: configurez un test via AWS SDK (STS/ECR GetAuthorizationToken).';

    await this.prisma.registryConfig.update({
      where: { id: registry.id },
      data: {
        isConnected: false,
        connectionError: message,
      },
    });

    return { ok: false, message };
  }

  private async testGCRConnection(
    registry: RegistryConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const message =
      'Test GCR non supporté actuellement: configurez un test via GCP IAM/Artifact Registry.';

    await this.prisma.registryConfig.update({
      where: { id: registry.id },
      data: {
        isConnected: false,
        connectionError: message,
      },
    });

    return { ok: false, message };
  }

  private async getRegistryConfigOrFail(id: string): Promise<RegistryConfig> {
    const registry = await this.prisma.registryConfig.findUnique({
      where: { id },
    });

    if (!registry) {
      throw new NotFoundException(`Registry "${id}" non trouvée`);
    }

    return registry;
  }

  private toRegistryConfigPublic(
    registry: RegistryConfig,
  ): RegistryConfigPublic {
    return {
      id: registry.id,
      name: registry.name,
      type: registry.type,
      username: registry.username ?? '',
      registryUrl: registry.registryUrl ?? '',
      isDefault: registry.isDefault,
      isConnected: registry.isConnected,
      connectionError: registry.connectionError,
      createdAt: registry.createdAt.toISOString(),
      updatedAt: registry.updatedAt.toISOString(),
    };
  }
}

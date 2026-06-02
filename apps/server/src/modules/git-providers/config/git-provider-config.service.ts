import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GitProviderType,
  type GitProviderConfig,
} from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../core/database/prisma.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { GitProviderOauthService } from './git-provider-oauth.service';

// ─── Public Types ────────────────────────────────────────────────────────────

export type GitProviderStatus = 'NOT_CONFIGURED' | 'ACTION_REQUIRED' | 'CONFIGURED';

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
export class GitProviderConfigService {
  private readonly logger = new Logger(GitProviderConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly crypto: CryptoService,
    private readonly oauth: GitProviderOauthService,
  ) {}

  // ─── Public decrypt helper (used by GithubService) ────────────────

  decryptProviderToken(value: string): string {
    return this.crypto.decrypt(value);
  }

  // ─── GitLab CRUD ─────────────────────────────────────────────────────────

  async listGitlabProviders(): Promise<GitlabProviderPublic[]> {
    await this.bootstrapLegacyGitlabProviderIfNeeded();
    const providers = await this.prisma.gitProviderConfig.findMany({
      where: { type: GitProviderType.GITLAB },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return providers.map((p) => this.toGitlabProviderPublic(p));
  }

  async listGitlabProvidersForProjects(): Promise<GitlabProviderProjectOption[]> {
    const providers = await this.listGitlabProviders();
    return providers.map(({ id, name, gitlabUrl, isDefault, status }) => ({
      id,
      name,
      gitlabUrl,
      isDefault,
      status,
    }));
  }

  async resolveGitlabCredentials(providerId?: string): Promise<ResolvedGitlabCredentials> {
    await this.bootstrapLegacyGitlabProviderIfNeeded();

    const provider = providerId
      ? await this.getGitlabProviderOrFail(providerId)
      : await this.getDefaultGitlabProvider();

    if (!provider) {
      throw new BadRequestException('Aucun provider GitLab configuré');
    }

    const refreshed = await this.oauth.refreshProviderOAuthTokenIfNeeded(provider);
    const gitlabUrl = refreshed.gitlabUrl.trim();
    if (!gitlabUrl) {
      throw new BadRequestException('GitLab URL manquante sur le provider');
    }

    const oauthToken = refreshed.oauthAccessToken
      ? this.crypto.decrypt(refreshed.oauthAccessToken).trim()
      : '';
    if (oauthToken) {
      return { providerId: refreshed.id, gitlabUrl, token: oauthToken, tokenSource: 'oauth' };
    }

    const adminToken = refreshed.adminToken
      ? this.crypto.decrypt(refreshed.adminToken).trim()
      : '';
    if (adminToken) {
      return { providerId: refreshed.id, gitlabUrl, token: adminToken, tokenSource: 'admin' };
    }

    throw new BadRequestException(
      'Ce provider GitLab ne possède ni OAuth token ni Admin Token. ' +
        'Configurez un Admin Token dans Platform Settings → Git Providers.',
    );
  }

  async createGitlabProvider(input: UpsertGitlabProviderInput): Promise<GitlabProviderPublic> {
    const name = this.requireNonEmpty(input.name, 'Name est requis');
    const gitlabUrl = this.requireNonEmpty(input.gitlabUrl, 'GitLab URL est requis');

    const count = await this.prisma.gitProviderConfig.count({
      where: { type: GitProviderType.GITLAB },
    });
    const shouldBeDefault = count === 0 ? true : input.isDefault === true;

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
        internalUrl: this.normalizeOptional(input.internalUrl),
        redirectUri: this.normalizeOptional(input.redirectUri),
        applicationId: this.normalizeOptional(input.applicationId),
        applicationSecret: this.crypto.encryptOptional(input.applicationSecret),
        groupNames: this.normalizeOptional(input.groupNames),
        adminToken: this.crypto.encryptOptional(input.adminToken),
        isDefault: shouldBeDefault,
      },
    });

    if (shouldBeDefault) {
      await this.syncLegacyDefaultGitlabConfig();
    }

    await this.syncGitlabRegistry(provider.name, gitlabUrl);
    return this.toGitlabProviderPublic(provider);
  }

  async updateGitlabProvider(id: string, input: PatchGitlabProviderInput): Promise<GitlabProviderPublic> {
    const current = await this.getGitlabProviderOrFail(id);
    const data: Partial<GitProviderConfig> = {};

    if (typeof input.name === 'string') data.name = this.requireNonEmpty(input.name, 'Name est requis');
    if (typeof input.gitlabUrl === 'string') data.gitlabUrl = this.requireNonEmpty(input.gitlabUrl, 'GitLab URL est requis');
    if (typeof input.internalUrl === 'string') data.internalUrl = this.normalizeOptional(input.internalUrl);
    if (typeof input.redirectUri === 'string') data.redirectUri = this.normalizeOptional(input.redirectUri);
    if (typeof input.applicationId === 'string') data.applicationId = this.normalizeOptional(input.applicationId);
    if (typeof input.groupNames === 'string') data.groupNames = this.normalizeOptional(input.groupNames);
    if (typeof input.applicationSecret === 'string') data.applicationSecret = this.crypto.encryptOptional(input.applicationSecret);
    if (typeof input.adminToken === 'string') data.adminToken = this.crypto.encryptOptional(input.adminToken);

    if (input.isDefault === true && !current.isDefault) {
      await this.prisma.gitProviderConfig.updateMany({
        where: { type: GitProviderType.GITLAB, isDefault: true },
        data: { isDefault: false },
      });
      data.isDefault = true;
    }

    const updated = await this.prisma.gitProviderConfig.update({ where: { id }, data });

    if (updated.isDefault || current.isDefault || input.isDefault === true) {
      await this.syncLegacyDefaultGitlabConfig();
    }

    const effectiveUrl = updated.gitlabUrl ?? current.gitlabUrl;
    const effectiveName = updated.name ?? current.name;
    await this.syncGitlabRegistry(effectiveName, effectiveUrl);
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
      this.prisma.gitProviderConfig.update({ where: { id }, data: { isDefault: true } }),
    ]);
    await this.syncLegacyDefaultGitlabConfig();
    const updated = await this.getGitlabProviderOrFail(id);
    return this.toGitlabProviderPublic(updated);
  }

  async testGitlab(providerId?: string): Promise<{ ok: boolean; message: string }> {
    await this.bootstrapLegacyGitlabProviderIfNeeded();

    if (providerId) {
      const provider = await this.getGitlabProviderOrFail(providerId);
      return this.testGitlabProvider(provider);
    }

    const defaultProvider = await this.getDefaultGitlabProvider();
    if (defaultProvider) {
      return this.testGitlabProvider(defaultProvider);
    }

    return this.testGitlabLegacyConfig();
  }

  // ─── GitHub CRUD ─────────────────────────────────────────────────────────

  async listGithubProviders(): Promise<GitlabProviderPublic[]> {
    const providers = await this.prisma.gitProviderConfig.findMany({
      where: { type: GitProviderType.GITHUB },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return providers.map((p) => this.toGithubProviderPublic(p));
  }

  async createGithubProvider(input: UpsertGitlabProviderInput): Promise<GitlabProviderPublic> {
    const name = this.requireNonEmpty(input.name, 'Name est requis');
    const gitlabUrl = this.requireNonEmpty(input.gitlabUrl, 'GitHub URL est requis');

    const count = await this.prisma.gitProviderConfig.count({ where: { type: GitProviderType.GITHUB } });
    const shouldBeDefault = count === 0 ? true : input.isDefault === true;

    if (shouldBeDefault) {
      await this.prisma.gitProviderConfig.updateMany({
        where: { type: GitProviderType.GITHUB, isDefault: true },
        data: { isDefault: false },
      });
    }

    const provider = await this.prisma.gitProviderConfig.create({
      data: {
        name,
        type: GitProviderType.GITHUB,
        gitlabUrl,
        internalUrl: this.normalizeOptional(input.internalUrl),
        redirectUri: this.normalizeOptional(input.redirectUri),
        applicationId: this.normalizeOptional(input.applicationId),
        applicationSecret: this.crypto.encryptOptional(input.applicationSecret),
        groupNames: this.normalizeOptional(input.groupNames),
        adminToken: this.crypto.encryptOptional(input.adminToken),
        isDefault: shouldBeDefault,
      },
    });

    return this.toGithubProviderPublic(provider);
  }

  async updateGithubProvider(id: string, input: PatchGitlabProviderInput): Promise<GitlabProviderPublic> {
    const current = await this.getGithubProviderOrFail(id);
    const data: Partial<GitProviderConfig> = {};

    if (typeof input.name === 'string') data.name = this.requireNonEmpty(input.name, 'Name est requis');
    if (typeof input.gitlabUrl === 'string') data.gitlabUrl = this.requireNonEmpty(input.gitlabUrl, 'GitHub URL est requis');
    if (typeof input.internalUrl === 'string') data.internalUrl = this.normalizeOptional(input.internalUrl);
    if (typeof input.redirectUri === 'string') data.redirectUri = this.normalizeOptional(input.redirectUri);
    if (typeof input.applicationId === 'string') data.applicationId = this.normalizeOptional(input.applicationId);
    if (typeof input.applicationSecret === 'string') data.applicationSecret = this.crypto.encryptOptional(input.applicationSecret);
    if (typeof input.groupNames === 'string') data.groupNames = this.normalizeOptional(input.groupNames);
    if (typeof input.adminToken === 'string') data.adminToken = this.crypto.encryptOptional(input.adminToken);

    if (input.isDefault === true && !current.isDefault) {
      await this.prisma.gitProviderConfig.updateMany({
        where: { type: GitProviderType.GITHUB, isDefault: true },
        data: { isDefault: false },
      });
      data.isDefault = true;
    }

    const updated = await this.prisma.gitProviderConfig.update({ where: { id }, data });
    return this.toGithubProviderPublic(updated);
  }

  async deleteGithubProvider(id: string): Promise<void> {
    await this.getGithubProviderOrFail(id);
    await this.prisma.gitProviderConfig.delete({ where: { id } });
  }

  async setDefaultGithubProvider(id: string): Promise<GitlabProviderPublic> {
    await this.getGithubProviderOrFail(id);
    await this.prisma.gitProviderConfig.updateMany({
      where: { type: GitProviderType.GITHUB, isDefault: true },
      data: { isDefault: false },
    });
    const updated = await this.prisma.gitProviderConfig.update({
      where: { id },
      data: { isDefault: true },
    });
    return this.toGithubProviderPublic(updated);
  }

  async testGithubProvider(id: string): Promise<{ ok: boolean; message: string }> {
    const provider = await this.getGithubProviderOrFail(id);
    const adminToken = provider.adminToken ? this.crypto.decrypt(provider.adminToken).trim() : '';
    const oauthToken = provider.oauthAccessToken ? this.crypto.decrypt(provider.oauthAccessToken).trim() : '';

    if (!adminToken && !oauthToken) {
      throw new BadRequestException('Configure un PAT GitHub ou connecte OAuth avant le test');
    }

    const apiBase = this.buildGithubApiBase(provider.gitlabUrl.trim());
    const tokens = oauthToken
      ? [{ token: oauthToken, label: 'OAuth' }, ...(adminToken ? [{ token: adminToken, label: 'PAT' }] : [])]
      : [{ token: adminToken, label: 'PAT' }];

    for (const { token, label } of tokens) {
      try {
        await firstValueFrom(
          this.http.get(`${apiBase}/user`, { headers: { Authorization: `Bearer ${token}` } }),
        );
        return { ok: true, message: `Connexion GitHub valide (${label})` };
      } catch {
        // try next token
      }
    }

    throw new BadRequestException('Test GitHub échoué — vérifiez votre PAT ou OAuth');
  }

  async listGithubRepos(id: string): Promise<{ id: number; name: string; fullName: string; httpUrl: string; defaultBranch: string }[]> {
    const provider = await this.getGithubProviderOrFail(id);
    const adminToken = provider.adminToken ? this.crypto.decrypt(provider.adminToken).trim() : '';
    const oauthToken = provider.oauthAccessToken ? this.crypto.decrypt(provider.oauthAccessToken).trim() : '';
    const token = oauthToken || adminToken;

    if (!token) throw new BadRequestException('Configure un PAT GitHub avant de lister les repos');

    const apiBase = this.buildGithubApiBase(provider.gitlabUrl.trim());
    type GithubRepo = { id: number; name: string; full_name: string; clone_url: string; default_branch: string };
    const repos: GithubRepo[] = [];
    let page = 1;

    while (true) {
      const res = await firstValueFrom(
        this.http.get<GithubRepo[]>(`${apiBase}/user/repos`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 100, page, sort: 'updated' },
        }),
      );
      if (!res.data || res.data.length === 0) break;
      repos.push(...res.data);
      if (res.data.length < 100) break;
      page++;
    }

    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      httpUrl: r.clone_url,
      defaultBranch: r.default_branch,
    }));
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async testGitlabProvider(provider: GitProviderConfig): Promise<{ ok: boolean; message: string }> {
    const refreshed = await this.oauth.refreshProviderOAuthTokenIfNeeded(provider);
    const gitlabUrl = this.normalizeGitlabBaseUrl(refreshed.gitlabUrl.trim());

    if (!gitlabUrl) throw new BadRequestException('GitLab URL manquant pour ce provider');

    const oauthToken = refreshed.oauthAccessToken ? this.crypto.decrypt(refreshed.oauthAccessToken).trim() : '';
    const adminToken = refreshed.adminToken ? this.crypto.decrypt(refreshed.adminToken).trim() : '';

    if (!oauthToken && !adminToken) {
      throw new BadRequestException('Configure un token OAuth ou un Admin Token pour ce provider');
    }

    if (oauthToken) {
      try {
        await this.requestGitlabCurrentUser(gitlabUrl, { Authorization: `Bearer ${oauthToken}` });
        return { ok: true, message: 'Connexion GitLab valide (OAuth)' };
      } catch {
        // fallback to admin token
      }
    }

    if (adminToken) {
      await this.requestGitlabCurrentUser(gitlabUrl, { 'PRIVATE-TOKEN': adminToken });
      return {
        ok: true,
        message: oauthToken ? 'Connexion GitLab valide (fallback Admin Token)' : 'Connexion GitLab valide (Admin Token)',
      };
    }

    throw new BadRequestException('Test GitLab échoué');
  }

  private async testGitlabLegacyConfig(): Promise<{ ok: boolean; message: string }> {
    const gitlabUrl = ((await this.getLegacyPlatformConfig('GITLAB_URL')) ?? '').trim();
    const oauthToken = ((await this.getLegacyPlatformConfig('GITLAB_OAUTH_ACCESS_TOKEN')) ?? '').trim();
    const adminToken = ((await this.getLegacyPlatformConfig('GITLAB_TOKEN')) ?? '').trim();

    if (!gitlabUrl) throw new BadRequestException('GITLAB_URL doit être configuré');
    if (!oauthToken && !adminToken) {
      throw new BadRequestException('Configure un token OAuth GitLab ou GITLAB_TOKEN avant le test');
    }

    const normalizedUrl = this.normalizeGitlabBaseUrl(gitlabUrl);

    if (oauthToken) {
      try {
        await this.requestGitlabCurrentUser(normalizedUrl, { Authorization: `Bearer ${oauthToken}` });
        return { ok: true, message: 'Connexion GitLab valide (OAuth)' };
      } catch {
        // fallback
      }
    }

    if (adminToken) {
      await this.requestGitlabCurrentUser(normalizedUrl, { 'PRIVATE-TOKEN': adminToken });
      return {
        ok: true,
        message: oauthToken
          ? 'Connexion GitLab valide (fallback Admin Token)'
          : 'Connexion GitLab valide (Admin Token)',
      };
    }

    throw new BadRequestException('Test GitLab échoué');
  }

  private async requestGitlabCurrentUser(gitlabBaseUrl: string, headers: Record<string, string>): Promise<void> {
    await firstValueFrom(this.http.get(`${gitlabBaseUrl}/api/v4/user`, { headers }));
  }

  private async getGitlabProviderOrFail(id: string): Promise<GitProviderConfig> {
    const provider = await this.prisma.gitProviderConfig.findUnique({ where: { id } });
    if (!provider || provider.type !== GitProviderType.GITLAB) {
      throw new NotFoundException('Provider GitLab introuvable');
    }
    return provider;
  }

  private async getGithubProviderOrFail(id: string): Promise<GitProviderConfig> {
    const provider = await this.prisma.gitProviderConfig.findUnique({ where: { id } });
    if (!provider || provider.type !== GitProviderType.GITHUB) {
      throw new NotFoundException('Provider GitHub introuvable');
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


  private async bootstrapLegacyGitlabProviderIfNeeded(): Promise<void> {
    const count = await this.prisma.gitProviderConfig.count({ where: { type: GitProviderType.GITLAB } });
    if (count > 0) return;

    const legacyUrl = ((await this.getLegacyPlatformConfig('GITLAB_URL')) ?? '').trim();
    if (!legacyUrl) return;

    const name = ((await this.getLegacyPlatformConfig('GITLAB_PROVIDER_NAME')) ?? '').trim() || 'GitLab Legacy';
    const oauthExpiresAtRaw = this.normalizeOptional(await this.getLegacyPlatformConfig('GITLAB_OAUTH_EXPIRES_AT'));
    const oauthExpiresAt = oauthExpiresAtRaw ? new Date(oauthExpiresAtRaw) : null;

    await this.prisma.gitProviderConfig.create({
      data: {
        name,
        type: GitProviderType.GITLAB,
        gitlabUrl: legacyUrl,
        internalUrl: this.normalizeOptional(await this.getLegacyPlatformConfig('GITLAB_INTERNAL_URL')),
        redirectUri: this.normalizeOptional(await this.getLegacyPlatformConfig('GITLAB_REDIRECT_URI')),
        applicationId: this.normalizeOptional(await this.getLegacyPlatformConfig('GITLAB_APP_ID')),
        applicationSecret: this.crypto.encryptOptional(await this.getLegacyPlatformConfig('GITLAB_APP_SECRET') ?? undefined),
        groupNames: this.normalizeOptional(await this.getLegacyPlatformConfig('GITLAB_GROUP_NAMES')),
        adminToken: this.crypto.encryptOptional(await this.getLegacyPlatformConfig('GITLAB_TOKEN') ?? undefined),
        oauthAccessToken: this.crypto.encryptOptional(await this.getLegacyPlatformConfig('GITLAB_OAUTH_ACCESS_TOKEN') ?? undefined),
        oauthRefreshToken: this.crypto.encryptOptional(await this.getLegacyPlatformConfig('GITLAB_OAUTH_REFRESH_TOKEN') ?? undefined),
        oauthExpiresAt: oauthExpiresAt && !Number.isNaN(oauthExpiresAt.getTime()) ? oauthExpiresAt : null,
        isDefault: true,
      },
    });

    await this.syncLegacyDefaultGitlabConfig();
  }

  private async syncLegacyDefaultGitlabConfig(): Promise<void> {
    const provider = await this.getDefaultGitlabProvider();

    if (!provider) {
      await this.prisma.platformConfig.deleteMany({ where: { key: { in: LEGACY_GITLAB_KEYS } } });
      return;
    }

    const upsertOrClear = async (key: string, value: string | null | undefined, isSecret: boolean) => {
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
      upsertOrClear('GITLAB_URL', provider.gitlabUrl, false),
      upsertOrClear('GITLAB_INTERNAL_URL', provider.internalUrl, false),
      upsertOrClear('GITLAB_REDIRECT_URI', provider.redirectUri, false),
      upsertOrClear('GITLAB_APP_ID', provider.applicationId, false),
      upsertOrClear('GITLAB_APP_SECRET', provider.applicationSecret ? this.crypto.decrypt(provider.applicationSecret) : null, true),
      upsertOrClear('GITLAB_GROUP_NAMES', provider.groupNames, false),
      upsertOrClear('GITLAB_TOKEN', provider.adminToken ? this.crypto.decrypt(provider.adminToken) : null, true),
      upsertOrClear('GITLAB_OAUTH_ACCESS_TOKEN', provider.oauthAccessToken ? this.crypto.decrypt(provider.oauthAccessToken) : null, true),
      upsertOrClear('GITLAB_OAUTH_REFRESH_TOKEN', provider.oauthRefreshToken ? this.crypto.decrypt(provider.oauthRefreshToken) : null, true),
      upsertOrClear('GITLAB_OAUTH_EXPIRES_AT', provider.oauthExpiresAt?.toISOString() ?? null, false),
    ]);
  }

  private async syncGitlabRegistry(providerName: string, gitlabUrl: string): Promise<void> {
    try {
      const registryName = `GitLab Registry — ${providerName}`;
      const registryUrl = this.inferGitlabRegistryUrl(gitlabUrl);

      const { RegistryProviderType } = await import('@prisma/client');

      await this.prisma.registryConfig.upsert({
        where: { type_name: { type: RegistryProviderType.GITLAB, name: registryName } },
        update: { registryUrl },
        create: { name: registryName, type: RegistryProviderType.GITLAB, registryUrl, isDefault: false, isConnected: false },
      });

      this.logger.log(`GitLab registry auto-configured: "${registryName}" → ${registryUrl}`);
    } catch (err) {
      this.logger.warn(
        `Failed to auto-configure GitLab registry for "${providerName}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private inferGitlabRegistryUrl(gitlabUrl: string): string {
    const normalized = gitlabUrl.trim().replace(/\/$/, '');
    if (['https://gitlab.com', 'http://gitlab.com', 'gitlab.com'].includes(normalized)) {
      return 'https://registry.gitlab.com';
    }
    try {
      const url = new URL(normalized.startsWith('http') ? normalized : `https://${normalized}`);
      return `https://registry.${url.hostname}`;
    } catch {
      return `https://registry.${normalized}`;
    }
  }

  private async getLegacyPlatformConfig(key: string): Promise<string | null> {
    const config = await this.prisma.platformConfig.findUnique({ where: { key } });
    if (!config) return null;
    return config.isSecret ? this.crypto.decrypt(config.value) : config.value;
  }

  private toGitlabProviderPublic(provider: GitProviderConfig): GitlabProviderPublic {
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

  private toGithubProviderPublic(provider: GitProviderConfig): GitlabProviderPublic {
    const isOAuthExpired = provider.oauthExpiresAt ? provider.oauthExpiresAt < new Date() : false;
    const oauthTokenConfigured = Boolean(provider.oauthAccessToken);
    const adminTokenConfigured = Boolean(provider.adminToken);
    const applicationSecretConfigured = Boolean(provider.applicationSecret);

    let status: GitProviderStatus = 'NOT_CONFIGURED';
    if (adminTokenConfigured || (oauthTokenConfigured && !isOAuthExpired)) {
      status = 'CONFIGURED';
    } else if (oauthTokenConfigured && isOAuthExpired) {
      status = 'ACTION_REQUIRED';
    }

    return {
      id: provider.id,
      name: provider.name,
      type: 'GITLAB' as const,
      gitlabUrl: provider.gitlabUrl,
      internalUrl: provider.internalUrl ?? '',
      redirectUri: provider.redirectUri ?? '',
      applicationId: provider.applicationId ?? '',
      applicationSecretConfigured,
      groupNames: provider.groupNames ?? '',
      adminTokenConfigured,
      oauthTokenConfigured,
      oauthExpiresAt: provider.oauthExpiresAt?.toISOString() ?? null,
      status,
      isDefault: provider.isDefault,
      createdAt: provider.createdAt.toISOString(),
      updatedAt: provider.updatedAt.toISOString(),
    };
  }

  private buildGithubApiBase(providerUrl: string): string {
    const url = providerUrl.replace(/\/+$/, '');
    if (url === 'https://github.com' || url === 'http://github.com') {
      return 'https://api.github.com';
    }
    return `${url}/api/v3`;
  }

  private requireNonEmpty(value: string, errorMessage: string): string {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(errorMessage);
    return normalized;
  }

  private normalizeOptional(value?: string | null): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeGitlabBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }
}

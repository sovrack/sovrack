import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import {
  GitProviderType,
  RegistryProviderType,
  type GitProviderConfig,
} from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import {
  inferGitlabRegistryUrl,
  normalizeOptional,
} from './git-provider-config.util';

// The legacy single-GitLab-config lived in PlatformConfig under these keys.
// We keep them in sync with the default GitProviderConfig row for backward
// compatibility (old code paths / env bootstrap still read them).
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

/**
 * Owns the LEGACY GitLab compatibility layer extracted from
 * GitProviderConfigService (god-file split):
 *  - bootstrapping a GitProviderConfig row from the old PlatformConfig keys,
 *  - mirroring the default GitLab provider back into those PlatformConfig keys,
 *  - auto-provisioning the GitLab container registry from the provider.
 * Pure GitLab-legacy concern, isolated so the main config service stays focused
 * on CRUD across providers.
 */
@Injectable()
export class GitProviderLegacySyncService {
  private readonly logger = new Logger(GitProviderLegacySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly crypto: CryptoService,
  ) {}

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

  /**
   * If no GitLab provider row exists yet but legacy PlatformConfig keys are
   * present, materialize a GitProviderConfig row from them (one-time bootstrap).
   */
  async bootstrapIfNeeded(): Promise<void> {
    const count = await this.prisma.gitProviderConfig.count({
      where: { type: GitProviderType.GITLAB },
    });
    if (count > 0) return;

    const legacyUrl = (
      (await this.getLegacyPlatformConfig('GITLAB_URL')) ?? ''
    ).trim();
    if (!legacyUrl) return;

    const name =
      (
        (await this.getLegacyPlatformConfig('GITLAB_PROVIDER_NAME')) ?? ''
      ).trim() || 'GitLab Legacy';
    const oauthExpiresAtRaw = normalizeOptional(
      await this.getLegacyPlatformConfig('GITLAB_OAUTH_EXPIRES_AT'),
    );
    const oauthExpiresAt = oauthExpiresAtRaw
      ? new Date(oauthExpiresAtRaw)
      : null;

    await this.prisma.gitProviderConfig.create({
      data: {
        name,
        type: GitProviderType.GITLAB,
        providerUrl: legacyUrl,
        internalUrl: normalizeOptional(
          await this.getLegacyPlatformConfig('GITLAB_INTERNAL_URL'),
        ),
        redirectUri: normalizeOptional(
          await this.getLegacyPlatformConfig('GITLAB_REDIRECT_URI'),
        ),
        applicationId: normalizeOptional(
          await this.getLegacyPlatformConfig('GITLAB_APP_ID'),
        ),
        applicationSecret: this.crypto.encryptOptional(
          (await this.getLegacyPlatformConfig('GITLAB_APP_SECRET')) ??
            undefined,
        ),
        groupNames: normalizeOptional(
          await this.getLegacyPlatformConfig('GITLAB_GROUP_NAMES'),
        ),
        adminToken: this.crypto.encryptOptional(
          (await this.getLegacyPlatformConfig('GITLAB_TOKEN')) ?? undefined,
        ),
        oauthAccessToken: this.crypto.encryptOptional(
          (await this.getLegacyPlatformConfig('GITLAB_OAUTH_ACCESS_TOKEN')) ??
            undefined,
        ),
        oauthRefreshToken: this.crypto.encryptOptional(
          (await this.getLegacyPlatformConfig('GITLAB_OAUTH_REFRESH_TOKEN')) ??
            undefined,
        ),
        oauthExpiresAt:
          oauthExpiresAt && !Number.isNaN(oauthExpiresAt.getTime())
            ? oauthExpiresAt
            : null,
        isDefault: true,
      },
    });

    await this.syncDefaultConfig();
  }

  /** Mirror the default GitLab provider into the legacy PlatformConfig keys. */
  async syncDefaultConfig(): Promise<void> {
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
      const normalized = normalizeOptional(value);
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

  /**
   * Auto-provisionne (et resync) le registre GitLab lié à un provider Git. La
   * logique « pro » : on RÉUTILISE le token du provider comme mot de passe du
   * registre et on récupère le username via l'API GitLab (`/user`) — auth
   * registre par PAT = username du compte. Ainsi le registre est utilisable
   * immédiatement (si le token a le scope read_registry/api), sans ressaisie.
   * Lien `providerId` → dédoublonnage + resync à chaque update du provider.
   */
  async syncRegistry(provider: {
    id: string;
    name: string;
    providerUrl: string;
    adminToken: string | null;
  }): Promise<void> {
    try {
      const registryName = `GitLab Registry — ${provider.name}`;
      const registryUrl = inferGitlabRegistryUrl(provider.providerUrl);

      // Réutilise le token (déjà chiffré, même CryptoService) + username via API.
      let username: string | null = null;
      const encryptedPassword: string | null = provider.adminToken ?? null;
      if (provider.adminToken) {
        const token = this.crypto.decrypt(provider.adminToken);
        username = await this.fetchGitlabUsername(provider.providerUrl, token);
      }

      const data = {
        name: registryName,
        type: RegistryProviderType.GITLAB,
        registryUrl,
        providerId: provider.id,
        ...(username ? { username } : {}),
        ...(encryptedPassword ? { password: encryptedPassword } : {}),
      };

      // Dédoublonnage par provider (robuste au renommage), repli sur type+name.
      const existing =
        (await this.prisma.registryConfig.findFirst({
          where: { providerId: provider.id },
        })) ??
        (await this.prisma.registryConfig.findFirst({
          where: { type: RegistryProviderType.GITLAB, name: registryName },
        }));

      if (existing) {
        await this.prisma.registryConfig.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.registryConfig.create({
          data: { ...data, isDefault: false, isConnected: false },
        });
      }

      this.logger.log(
        `GitLab registry auto-configured: "${registryName}" → ${registryUrl}` +
          (username ? ` (user ${username})` : ' (token à compléter)'),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to auto-configure GitLab registry for "${provider.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Récupère le username GitLab via l'API (`GET /api/v4/user`). Best-effort. */
  private async fetchGitlabUsername(
    providerUrl: string,
    token: string,
  ): Promise<string | null> {
    try {
      const url = `${providerUrl.replace(/\/$/, '')}/api/v4/user`;
      const res = await firstValueFrom(
        this.http.get<{ username?: string }>(url, {
          headers: { 'PRIVATE-TOKEN': token },
          timeout: 8000,
          validateStatus: () => true,
        }),
      );
      return res.status === 200 && res.data?.username
        ? res.data.username
        : null;
    } catch {
      return null;
    }
  }

  private async getLegacyPlatformConfig(key: string): Promise<string | null> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { key },
    });
    if (!config) return null;
    return config.isSecret ? this.crypto.decrypt(config.value) : config.value;
  }
}

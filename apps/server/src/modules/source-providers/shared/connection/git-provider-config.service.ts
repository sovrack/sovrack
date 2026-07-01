import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GitProviderType, type GitProviderConfig } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GitProviderOauthService } from './git-provider-oauth.service';
import { GitProviderLegacySyncService } from './git-provider-legacy-sync.service';
import { GithubProviderService } from './github-provider.service';
import { GitlabConnectionTesterService } from './gitlab-connection-tester.service';
import { writeWithSingleDefault } from './provider-default-write.util';
import {
  normalizeOptional,
  requireNonEmpty,
  toGitlabProviderPublic,
  type GitlabProviderPublic,
  type GitProviderStatus,
} from './git-provider-config.util';

// ─── Public Types ────────────────────────────────────────────────────────────

// GitProviderStatus + GitlabProviderPublic now live in ./git-provider-config.util;
// re-exported here so existing importers of this module keep working.
export type { GitProviderStatus, GitlabProviderPublic };

export type GitlabProviderProjectOption = {
  id: string;
  name: string;
  providerUrl: string;
  isDefault: boolean;
  status: GitProviderStatus;
};

export type ResolvedGitlabCredentials = {
  providerId: string;
  providerUrl: string;
  token: string;
  tokenSource: 'oauth' | 'admin';
};

export type UpsertGitlabProviderInput = {
  name: string;
  /** Base URL for the provider (gitlab.example.com or github.com). */
  providerUrl: string;
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
  /** Base URL for the provider (gitlab.example.com or github.com). */
  providerUrl?: string;
  internalUrl?: string;
  redirectUri?: string;
  applicationId?: string;
  applicationSecret?: string;
  groupNames?: string;
  adminToken?: string;
  isDefault?: boolean;
};

// ─── GitHub type aliases (same shape as GitLab types) ──────────────────

type UpsertGithubProviderInput = UpsertGitlabProviderInput;
type PatchGithubProviderInput = PatchGitlabProviderInput;

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class GitProviderConfigService {
  private readonly logger = new Logger(GitProviderConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly oauth: GitProviderOauthService,
    private readonly legacySync: GitProviderLegacySyncService,
    private readonly github: GithubProviderService,
    private readonly tester: GitlabConnectionTesterService,
  ) {}

  // ─── Public decrypt helper (used by GithubAdapter) ────────────────

  decryptProviderToken(value: string): string {
    return this.crypto.decrypt(value);
  }

  // ─── GitLab CRUD ─────────────────────────────────────────────────────────

  async listGitlabProviders(): Promise<GitlabProviderPublic[]> {
    await this.legacySync.bootstrapIfNeeded();
    const providers = await this.prisma.gitProviderConfig.findMany({
      where: { type: GitProviderType.GITLAB },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return providers.map((p) => toGitlabProviderPublic(p));
  }

  async listGitlabProvidersForProjects(): Promise<
    GitlabProviderProjectOption[]
  > {
    const providers = await this.listGitlabProviders();
    return providers.map(({ id, name, providerUrl, isDefault, status }) => ({
      id,
      name,
      providerUrl,
      isDefault,
      status,
    }));
  }

  async resolveGitlabCredentials(
    providerId?: string,
  ): Promise<ResolvedGitlabCredentials> {
    await this.legacySync.bootstrapIfNeeded();

    const provider = providerId
      ? await this.getGitlabProviderOrFail(providerId)
      : await this.getDefaultGitlabProvider();

    if (!provider) {
      throw new BadRequestException('Aucun provider GitLab configuré');
    }

    const refreshed =
      await this.oauth.refreshProviderOAuthTokenIfNeeded(provider);
    const gitlabUrl = refreshed.providerUrl.trim();
    if (!gitlabUrl) {
      throw new BadRequestException('GitLab URL manquante sur le provider');
    }

    const oauthToken = refreshed.oauthAccessToken
      ? this.crypto.decrypt(refreshed.oauthAccessToken).trim()
      : '';
    if (oauthToken) {
      return {
        providerId: refreshed.id,
        providerUrl: gitlabUrl,
        token: oauthToken,
        tokenSource: 'oauth',
      };
    }

    const adminToken = refreshed.adminToken
      ? this.crypto.decrypt(refreshed.adminToken).trim()
      : '';
    if (adminToken) {
      return {
        providerId: refreshed.id,
        providerUrl: gitlabUrl,
        token: adminToken,
        tokenSource: 'admin',
      };
    }

    throw new BadRequestException(
      'Ce provider GitLab ne possède ni OAuth token ni Admin Token. ' +
        'Configurez un Admin Token dans Platform Settings → Git Providers.',
    );
  }

  /**
   * Atomically clears the current default of a provider type (when
   * `clearDefault`) and runs `write` inside the SAME transaction, so a type can
   * never end up with two `isDefault=true` rows. The `@@index([type, isDefault])`
   * is non-unique and does not enforce this on its own (audit §6).
   */
  async createGitlabProvider(
    input: UpsertGitlabProviderInput,
  ): Promise<GitlabProviderPublic> {
    const name = requireNonEmpty(input.name, 'Name est requis');
    const gitlabUrl = requireNonEmpty(
      input.providerUrl,
      'GitLab URL est requis',
    );

    const count = await this.prisma.gitProviderConfig.count({
      where: { type: GitProviderType.GITLAB },
    });
    const shouldBeDefault = count === 0 ? true : input.isDefault === true;

    const provider = await writeWithSingleDefault(
      this.prisma,
      GitProviderType.GITLAB,
      shouldBeDefault,
      (tx) =>
        tx.gitProviderConfig.create({
          data: {
            name,
            type: GitProviderType.GITLAB,
            providerUrl: gitlabUrl,
            internalUrl: normalizeOptional(input.internalUrl),
            redirectUri: normalizeOptional(input.redirectUri),
            applicationId: normalizeOptional(input.applicationId),
            applicationSecret: this.crypto.encryptOptional(
              input.applicationSecret,
            ),
            groupNames: normalizeOptional(input.groupNames),
            adminToken: this.crypto.encryptOptional(input.adminToken),
            isDefault: shouldBeDefault,
          },
        }),
    );

    if (shouldBeDefault) {
      await this.legacySync.syncDefaultConfig();
    }

    await this.legacySync.syncRegistry({
      id: provider.id,
      name: provider.name,
      providerUrl: gitlabUrl,
      adminToken: provider.adminToken,
    });
    return toGitlabProviderPublic(provider);
  }

  async updateGitlabProvider(
    id: string,
    input: PatchGitlabProviderInput,
  ): Promise<GitlabProviderPublic> {
    const current = await this.getGitlabProviderOrFail(id);
    const data: Partial<GitProviderConfig> = {};

    if (typeof input.name === 'string')
      data.name = requireNonEmpty(input.name, 'Name est requis');
    if (typeof input.providerUrl === 'string')
      data.providerUrl = requireNonEmpty(
        input.providerUrl,
        'GitLab URL est requis',
      );
    if (typeof input.internalUrl === 'string')
      data.internalUrl = normalizeOptional(input.internalUrl);
    if (typeof input.redirectUri === 'string')
      data.redirectUri = normalizeOptional(input.redirectUri);
    if (typeof input.applicationId === 'string')
      data.applicationId = normalizeOptional(input.applicationId);
    if (typeof input.groupNames === 'string')
      data.groupNames = normalizeOptional(input.groupNames);
    if (typeof input.applicationSecret === 'string')
      data.applicationSecret = this.crypto.encryptOptional(
        input.applicationSecret,
      );
    if (typeof input.adminToken === 'string')
      data.adminToken = this.crypto.encryptOptional(input.adminToken);

    const makeDefault = input.isDefault === true && !current.isDefault;
    if (makeDefault) {
      data.isDefault = true;
    }

    const updated = await writeWithSingleDefault(
      this.prisma,
      GitProviderType.GITLAB,
      makeDefault,
      (tx) => tx.gitProviderConfig.update({ where: { id }, data }),
    );

    if (updated.isDefault || current.isDefault || input.isDefault === true) {
      await this.legacySync.syncDefaultConfig();
    }

    const effectiveUrl = updated.providerUrl ?? current.providerUrl;
    const effectiveName = updated.name ?? current.name;
    await this.legacySync.syncRegistry({
      id: updated.id,
      name: effectiveName,
      providerUrl: effectiveUrl,
      adminToken: updated.adminToken ?? current.adminToken,
    });
    return toGitlabProviderPublic(updated);
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

    await this.legacySync.syncDefaultConfig();
  }

  async setDefaultGitlabProvider(id: string): Promise<GitlabProviderPublic> {
    await this.getGitlabProviderOrFail(id);
    const updated = await writeWithSingleDefault(
      this.prisma,
      GitProviderType.GITLAB,
      true,
      (tx) =>
        tx.gitProviderConfig.update({
          where: { id },
          data: { isDefault: true },
        }),
    );
    await this.legacySync.syncDefaultConfig();
    return toGitlabProviderPublic(updated);
  }

  async testGitlab(
    providerId?: string,
  ): Promise<{ ok: boolean; message: string }> {
    await this.legacySync.bootstrapIfNeeded();

    if (providerId) {
      const provider = await this.getGitlabProviderOrFail(providerId);
      return this.tester.testProvider(provider);
    }

    const defaultProvider = await this.getDefaultGitlabProvider();
    if (defaultProvider) {
      return this.tester.testProvider(defaultProvider);
    }

    return this.tester.testLegacyConfig();
  }

  // ─── GitHub CRUD (delegated to GithubProviderService) ──────────────────────

  listGithubProviders(): Promise<GitlabProviderPublic[]> {
    return this.github.list();
  }

  createGithubProvider(
    input: UpsertGithubProviderInput,
  ): Promise<GitlabProviderPublic> {
    return this.github.create(input);
  }

  updateGithubProvider(
    id: string,
    input: PatchGithubProviderInput,
  ): Promise<GitlabProviderPublic> {
    return this.github.update(id, input);
  }

  deleteGithubProvider(id: string): Promise<void> {
    return this.github.remove(id);
  }

  setDefaultGithubProvider(id: string): Promise<GitlabProviderPublic> {
    return this.github.setDefault(id);
  }

  testGithubProvider(id: string): Promise<{ ok: boolean; message: string }> {
    return this.github.test(id);
  }

  listGithubRepos(id: string): Promise<
    {
      id: number;
      name: string;
      fullName: string;
      httpUrl: string;
      defaultBranch: string;
    }[]
  > {
    return this.github.listRepos(id);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

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
}

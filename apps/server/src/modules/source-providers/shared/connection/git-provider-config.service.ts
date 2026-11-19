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
import { assertSafeOutboundHttpsUrl } from '../../../../shared/http/outbound-url-policy.util';
import type { GitRepoOption } from './git-provider.types';

// ─── Public Types ────────────────────────────────────────────────────────────

export type { GitRepoOption };

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

type UpsertGithubProviderInput = Pick<
  UpsertGitlabProviderInput,
  'name' | 'providerUrl' | 'internalUrl' | 'adminToken' | 'isDefault'
> & { adminToken: string };
type PatchGithubProviderInput = Partial<UpsertGithubProviderInput>;

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

  async listGitlabProviders(teamId: string): Promise<GitlabProviderPublic[]> {
    const providers = await this.prisma.gitProviderConfig.findMany({
      where: { teamId, type: GitProviderType.GITLAB },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return providers.map((p) => toGitlabProviderPublic(p));
  }

  async listGitlabProvidersForProjects(
    teamId: string,
  ): Promise<GitlabProviderProjectOption[]> {
    const providers = await this.listGitlabProviders(teamId);
    return providers.map(({ id, name, providerUrl, isDefault, status }) => ({
      id,
      name,
      providerUrl,
      isDefault,
      status,
    }));
  }

  async resolveGitlabCredentials(
    teamId: string,
    providerId?: string,
  ): Promise<ResolvedGitlabCredentials> {
    const provider = providerId
      ? await this.getGitlabProviderOrFail(providerId, teamId)
      : await this.getDefaultGitlabProvider(teamId);

    if (!provider) {
      throw new BadRequestException('Aucun provider GitLab configuré');
    }

    const refreshed =
      await this.oauth.refreshProviderOAuthTokenIfNeeded(provider);
    const gitlabUrl = assertSafeOutboundHttpsUrl(refreshed.providerUrl, {
      label: 'GitLab URL',
      allowPath: false,
    });
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
    teamId: string,
  ): Promise<GitlabProviderPublic> {
    const name = requireNonEmpty(input.name, 'Name est requis');
    const gitlabUrl = assertSafeOutboundHttpsUrl(
      requireNonEmpty(input.providerUrl, 'GitLab URL est requis'),
      { label: 'GitLab URL', allowPath: false },
    );
    const internalUrl = normalizeOptional(input.internalUrl);
    if (internalUrl) {
      assertSafeOutboundHttpsUrl(internalUrl, {
        label: 'GitLab internal URL',
        allowPath: false,
      });
    }
    if (normalizeOptional(input.redirectUri)) {
      throw new BadRequestException(
        "L'URI de callback OAuth est calculée par Sovrack et ne peut pas être personnalisée",
      );
    }

    const count = await this.prisma.gitProviderConfig.count({
      where: { teamId, type: GitProviderType.GITLAB },
    });
    const shouldBeDefault = count === 0 ? true : input.isDefault === true;

    const provider = await writeWithSingleDefault(
      this.prisma,
      teamId,
      GitProviderType.GITLAB,
      shouldBeDefault,
      (tx) =>
        tx.gitProviderConfig.create({
          data: {
            name,
            teamId,
            type: GitProviderType.GITLAB,
            providerUrl: gitlabUrl,
            internalUrl,
            redirectUri: null,
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
      await this.legacySync.syncDefaultConfig(teamId);
    }

    await this.legacySync.syncRegistry({
      id: provider.id,
      teamId,
      name: provider.name,
      providerUrl: gitlabUrl,
      adminToken: provider.adminToken,
    });
    return toGitlabProviderPublic(provider);
  }

  async updateGitlabProvider(
    id: string,
    input: PatchGitlabProviderInput,
    teamId: string,
  ): Promise<GitlabProviderPublic> {
    const current = await this.getGitlabProviderOrFail(id, teamId);
    const data: Partial<GitProviderConfig> = {};

    if (typeof input.name === 'string')
      data.name = requireNonEmpty(input.name, 'Name est requis');
    if (typeof input.providerUrl === 'string')
      data.providerUrl = assertSafeOutboundHttpsUrl(
        requireNonEmpty(input.providerUrl, 'GitLab URL est requis'),
        { label: 'GitLab URL', allowPath: false },
      );
    if (typeof input.internalUrl === 'string') {
      const internalUrl = normalizeOptional(input.internalUrl);
      data.internalUrl = internalUrl
        ? assertSafeOutboundHttpsUrl(internalUrl, {
            label: 'GitLab internal URL',
            allowPath: false,
          })
        : null;
    }
    if (normalizeOptional(input.redirectUri)) {
      throw new BadRequestException(
        "L'URI de callback OAuth est calculée par Sovrack et ne peut pas être personnalisée",
      );
    }
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
      teamId,
      GitProviderType.GITLAB,
      makeDefault,
      (tx) => tx.gitProviderConfig.update({ where: { id }, data }),
    );

    if (updated.isDefault || current.isDefault || input.isDefault === true) {
      await this.legacySync.syncDefaultConfig(teamId);
    }

    const effectiveUrl = updated.providerUrl ?? current.providerUrl;
    const effectiveName = updated.name ?? current.name;
    await this.legacySync.syncRegistry({
      id: updated.id,
      teamId,
      name: effectiveName,
      providerUrl: effectiveUrl,
      adminToken: updated.adminToken ?? current.adminToken,
    });
    return toGitlabProviderPublic(updated);
  }

  async deleteGitlabProvider(id: string, teamId: string): Promise<void> {
    const provider = await this.getGitlabProviderOrFail(id, teamId);
    await this.prisma.gitProviderConfig.delete({ where: { id } });

    if (provider.isDefault) {
      const replacement = await this.prisma.gitProviderConfig.findFirst({
        where: { teamId, type: GitProviderType.GITLAB },
        orderBy: { createdAt: 'asc' },
      });
      if (replacement) {
        await this.prisma.gitProviderConfig.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        });
      }
    }

    await this.legacySync.syncDefaultConfig(teamId);
  }

  async setDefaultGitlabProvider(
    id: string,
    teamId: string,
  ): Promise<GitlabProviderPublic> {
    await this.getGitlabProviderOrFail(id, teamId);
    const updated = await writeWithSingleDefault(
      this.prisma,
      teamId,
      GitProviderType.GITLAB,
      true,
      (tx) =>
        tx.gitProviderConfig.update({
          where: { id },
          data: { isDefault: true },
        }),
    );
    await this.legacySync.syncDefaultConfig(teamId);
    return toGitlabProviderPublic(updated);
  }

  async testGitlab(
    teamId: string,
    providerId?: string,
  ): Promise<{ ok: boolean; message: string }> {
    if (providerId) {
      const provider = await this.getGitlabProviderOrFail(providerId, teamId);
      return this.tester.testProvider(provider);
    }

    const defaultProvider = await this.getDefaultGitlabProvider(teamId);
    if (defaultProvider) {
      return this.tester.testProvider(defaultProvider);
    }

    return this.tester.testLegacyConfig();
  }

  // ─── GitHub CRUD (delegated to GithubProviderService) ──────────────────────

  listGithubProviders(teamId: string): Promise<GitlabProviderPublic[]> {
    return this.github.list(teamId);
  }

  createGithubProvider(
    input: UpsertGithubProviderInput,
    teamId: string,
  ): Promise<GitlabProviderPublic> {
    return this.github.create(input, teamId);
  }

  updateGithubProvider(
    id: string,
    input: PatchGithubProviderInput,
    teamId: string,
  ): Promise<GitlabProviderPublic> {
    return this.github.update(id, input, teamId);
  }

  deleteGithubProvider(id: string, teamId: string): Promise<void> {
    return this.github.remove(id, teamId);
  }

  setDefaultGithubProvider(
    id: string,
    teamId: string,
  ): Promise<GitlabProviderPublic> {
    return this.github.setDefault(id, teamId);
  }

  testGithubProvider(
    id: string,
    teamId: string,
  ): Promise<{ ok: boolean; message: string }> {
    return this.github.test(id, teamId);
  }

  listGithubRepos(id: string, teamId: string): Promise<GitRepoOption[]> {
    return this.github.listRepos(id, teamId);
  }

  async listGitlabRepos(
    id: string,
    teamId: string,
  ): Promise<GitRepoOption[]> {
    const provider = await this.getGitlabProviderOrFail(id, teamId);
    return this.tester.listRepos(provider);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getGitlabProviderOrFail(
    id: string,
    teamId: string,
  ): Promise<GitProviderConfig> {
    const provider = await this.prisma.gitProviderConfig.findFirst({
      where: { id, teamId },
    });
    if (!provider || provider.type !== GitProviderType.GITLAB) {
      throw new NotFoundException('Provider GitLab introuvable');
    }
    return provider;
  }

  private async getDefaultGitlabProvider(
    teamId: string,
  ): Promise<GitProviderConfig | null> {
    const defaultProvider = await this.prisma.gitProviderConfig.findFirst({
      where: { teamId, type: GitProviderType.GITLAB, isDefault: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (defaultProvider) return defaultProvider;
    return this.prisma.gitProviderConfig.findFirst({
      where: { teamId, type: GitProviderType.GITLAB },
      orderBy: { createdAt: 'asc' },
    });
  }
}

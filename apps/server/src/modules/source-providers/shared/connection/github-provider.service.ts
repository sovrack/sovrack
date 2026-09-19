import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GitProviderType, type GitProviderConfig } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import {
  buildGithubApiBase,
  normalizeOptional,
  requireNonEmpty,
  toGithubProviderPublic,
  type GitlabProviderPublic,
} from './git-provider-config.util';
import { writeWithSingleDefault } from './provider-default-write.util';
import { assertSafeOutboundHttpsUrl } from '../../../../shared/http/outbound-url-policy.util';

type UpsertProviderInput = {
  name: string;
  providerUrl: string;
  internalUrl?: string;
  adminToken: string;
  isDefault?: boolean;
};
type PatchProviderInput = Partial<UpsertProviderInput>;

export type GithubRepoOption = {
  id: number;
  name: string;
  fullName: string;
  httpUrl: string;
  defaultBranch: string;
};

/**
 * GitHub provider CRUD + connectivity test + repo listing. Extracted from
 * GitProviderConfigService (R2 god-file split); the latter delegates here.
 */
@Injectable()
export class GithubProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly crypto: CryptoService,
  ) {}

  async list(teamId: string): Promise<GitlabProviderPublic[]> {
    const providers = await this.prisma.gitProviderConfig.findMany({
      where: { teamId, type: GitProviderType.GITHUB },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return providers.map((p) => toGithubProviderPublic(p));
  }

  async create(
    input: UpsertProviderInput,
    teamId: string,
  ): Promise<GitlabProviderPublic> {
    const name = requireNonEmpty(input.name, 'Name est requis');
    const githubUrl = assertSafeOutboundHttpsUrl(
      requireNonEmpty(input.providerUrl, 'GitHub URL est requis'),
      { label: 'GitHub URL', allowPath: false },
    );
    const internalUrl = normalizeOptional(input.internalUrl);
    if (internalUrl) {
      assertSafeOutboundHttpsUrl(internalUrl, {
        label: 'GitHub internal URL',
        allowPath: false,
      });
    }
    const adminToken = requireNonEmpty(
      input.adminToken,
      'Un Personal Access Token GitHub est requis',
    );

    const count = await this.prisma.gitProviderConfig.count({
      where: { teamId, type: GitProviderType.GITHUB },
    });
    const shouldBeDefault = count === 0 ? true : input.isDefault === true;

    const provider = await writeWithSingleDefault(
      this.prisma,
      teamId,
      GitProviderType.GITHUB,
      shouldBeDefault,
      (tx) =>
        tx.gitProviderConfig.create({
          data: {
            name,
            teamId,
            type: GitProviderType.GITHUB,
            providerUrl: githubUrl,
            internalUrl,
            redirectUri: null,
            applicationId: null,
            applicationSecret: null,
            groupNames: null,
            adminToken: this.crypto.encryptOptional(adminToken),
            isDefault: shouldBeDefault,
          },
        }),
    );
    return toGithubProviderPublic(provider);
  }

  async update(
    id: string,
    input: PatchProviderInput,
    teamId: string,
  ): Promise<GitlabProviderPublic> {
    const current = await this.getOrFail(id, teamId);
    const data: Partial<GitProviderConfig> = {};

    if (typeof input.name === 'string')
      data.name = requireNonEmpty(input.name, 'Name est requis');
    if (typeof input.providerUrl === 'string')
      data.providerUrl = assertSafeOutboundHttpsUrl(
        requireNonEmpty(input.providerUrl, 'GitHub URL est requis'),
        { label: 'GitHub URL', allowPath: false },
      );
    if (typeof input.internalUrl === 'string') {
      const internalUrl = normalizeOptional(input.internalUrl);
      data.internalUrl = internalUrl
        ? assertSafeOutboundHttpsUrl(internalUrl, {
            label: 'GitHub internal URL',
            allowPath: false,
          })
        : null;
    }
    if (typeof input.adminToken === 'string')
      data.adminToken = this.crypto.encryptOptional(
        requireNonEmpty(
          input.adminToken,
          'Le token GitHub ne peut pas être vide',
        ),
      );

    const makeDefault = input.isDefault === true && !current.isDefault;
    if (makeDefault) {
      data.isDefault = true;
    }

    const updated = await writeWithSingleDefault(
      this.prisma,
      teamId,
      GitProviderType.GITHUB,
      makeDefault,
      (tx) => tx.gitProviderConfig.update({ where: { id }, data }),
    );
    return toGithubProviderPublic(updated);
  }

  async remove(id: string, teamId: string): Promise<void> {
    await this.getOrFail(id, teamId);
    await this.prisma.gitProviderConfig.delete({ where: { id } });
  }

  async setDefault(id: string, teamId: string): Promise<GitlabProviderPublic> {
    await this.getOrFail(id, teamId);
    const updated = await writeWithSingleDefault(
      this.prisma,
      teamId,
      GitProviderType.GITHUB,
      true,
      (tx) =>
        tx.gitProviderConfig.update({
          where: { id },
          data: { isDefault: true },
        }),
    );
    return toGithubProviderPublic(updated);
  }

  async test(
    id: string,
    teamId: string,
  ): Promise<{ ok: boolean; message: string }> {
    const provider = await this.getOrFail(id, teamId);
    const adminToken = provider.adminToken
      ? this.crypto.decrypt(provider.adminToken).trim()
      : '';
    if (!adminToken) {
      throw new BadRequestException(
        'Configure un Personal Access Token GitHub avant le test',
      );
    }

    const apiBase = buildGithubApiBase(provider.providerUrl.trim());
    try {
      await firstValueFrom(
        this.http.get(`${apiBase}/user`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
      );
      return { ok: true, message: 'Connexion GitHub valide (PAT)' };
    } catch {
      throw new BadRequestException(
        'Test GitHub échoué — vérifiez le PAT et ses permissions',
      );
    }
  }

  async listRepos(id: string, teamId: string): Promise<GithubRepoOption[]> {
    const provider = await this.getOrFail(id, teamId);
    const adminToken = provider.adminToken
      ? this.crypto.decrypt(provider.adminToken).trim()
      : '';
    const token = adminToken;

    if (!token)
      throw new BadRequestException(
        'Configure un PAT GitHub avant de lister les repos',
      );

    const apiBase = buildGithubApiBase(provider.providerUrl.trim());
    type GithubRepo = {
      id: number;
      name: string;
      full_name: string;
      clone_url: string;
      default_branch: string;
    };
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

  private async getOrFail(
    id: string,
    teamId: string,
  ): Promise<GitProviderConfig> {
    const provider = await this.prisma.gitProviderConfig.findFirst({
      where: { id, teamId },
    });
    if (!provider || provider.type !== GitProviderType.GITHUB) {
      throw new NotFoundException('Provider GitHub introuvable');
    }
    return provider;
  }
}
